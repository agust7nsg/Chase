import type { SupabaseClient } from '@supabase/supabase-js';
import { strictItems, parseRow, type CollectionOperation, type RemoteRow } from './model';
import type { CollectionCloud } from './store';

export class SupabaseCollectionCloud implements CollectionCloud {
  constructor(private client: SupabaseClient, private timeoutMs = 15000) {}
  private async bounded<T>(request: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([Promise.resolve(request(controller.signal)), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Cloud collection request timed out.')); }, this.timeoutMs);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }
  private async verify(owner: string) {
    const result = await this.bounded(() => this.client.auth.getUser());
    if (result.error || result.data.user?.id !== owner || result.data.user.is_anonymous) throw new Error('Sign in to sync this account.');
  }
  async read(owner: string): Promise<RemoteRow[]> {
    await this.verify(owner);
    const rows: RemoteRow[] = []; let cursor: string | null = null;
    // Small keyset pages stay under the shared bounded-fetch response limit.
    for (let page = 0; page <= 2000; page++) {
      let request = this.client.from('collection_items').select('card_id,quantity,added_at,card_snapshot,revision').eq('user_id', owner).order('card_id').limit(10);
      if (cursor) request = request.gt('card_id', cursor);
      const result = await this.bounded(signal => request.abortSignal(signal));
      if (result.error || !Array.isArray(result.data)) throw new Error('Cloud collection unavailable.');
      for (const value of result.data) {
        const item = value.quantity === 0 ? null : strictItems([{ cardId: value.card_id, quantity: value.quantity, addedAt: value.added_at, ...(value.card_snapshot ? { card: value.card_snapshot } : {}) }])[0];
        const row = parseRow({ cardId: value.card_id, revision: value.revision, item });
        if (cursor && row.cardId <= cursor) throw new Error('Invalid cloud page.');
        cursor = row.cardId; rows.push(row);
      }
      if (result.data.length < 10) return rows;
    }
    throw new Error('Cloud collection exceeds the supported size.');
  }
  async apply(owner: string, operation: CollectionOperation) {
    await this.verify(owner);
    const result = await this.bounded(signal => this.client.rpc('collection_apply', { p_owner: owner, p_operation: operation.id, p_card_id: operation.cardId,
      p_base_revision: operation.baseRevision, p_item: operation.item }).abortSignal(signal));
    const value = result.data;
    if (result.error || !value || !['ok', 'conflict'].includes(value.status)) throw new Error('Cloud change could not be confirmed.');
    const row = parseRow(value.row);
    if (row.cardId !== operation.cardId) throw new Error('Unexpected cloud receipt.');
    return { status: value.status as 'ok' | 'conflict', row };
  }
}
