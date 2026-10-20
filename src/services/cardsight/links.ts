import type { Card } from '../../types/domain';
import type { CatalogStorage } from '../tcgdex/types';
import type { CardSightCandidate } from './types';

interface Link { providerId: string; language: 'en'; tcgdexId: string; providerSetId?: string }
const KEY = 'chase.cardsight-links.v1';

/** Only explicit printing confirmation writes cross-provider links. Never rewrites ownership. */
export class RecognitionLinks {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly storage: CatalogStorage) {}
  private async read(): Promise<Link[]> {
    const raw = await this.storage.getItem(KEY);
    if (!raw) return [];
    let data: unknown;
    try { data = JSON.parse(raw); } catch { return []; }
    if (!Array.isArray(data) || data.length > 500) return [];
    return data.filter((link): link is Link => link && typeof link === 'object' && typeof link.providerId === 'string'
      && link.providerId.length <= 256 && link.language === 'en' && typeof link.tcgdexId === 'string'
      && /^[a-zA-Z0-9._-]{1,200}$/.test(link.tcgdexId) && (link.providerSetId === undefined || typeof link.providerSetId === 'string'));
  }
  async lookup(candidate: CardSightCandidate): Promise<string | undefined> {
    if (candidate.language !== 'en' && candidate.language !== 'und') return;
    await this.queue;
    return (await this.read()).find(link => link.providerId === candidate.providerId && link.providerSetId === candidate.providerSetId)?.tcgdexId;
  }
  remember(candidate: CardSightCandidate, card: Card): Promise<void> {
    if (card.catalogIdentity?.provider !== 'tcgdex' || card.catalogIdentity.language !== 'en'
      || (candidate.language !== 'en' && candidate.language !== 'und')) return Promise.resolve();
    const canonicalId = card.catalogIdentity.id;
    const operation = this.queue.then(async () => {
      const links = (await this.read()).filter(link => link.providerId !== candidate.providerId || link.providerSetId !== candidate.providerSetId);
      links.push({ providerId: candidate.providerId, language: 'en', tcgdexId: canonicalId,
        ...(candidate.providerSetId ? { providerSetId: candidate.providerSetId } : {}) });
      await this.storage.setItem(KEY, JSON.stringify(links.slice(-500)));
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
