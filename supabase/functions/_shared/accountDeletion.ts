import { boundedJson, deadline, isRecord, isUserId } from './hostedProtocol.ts';
export interface DeletionRequest { ownerId: string; operationId: string; proof: string; confirmation: 'DELETE' }
export interface DeletionReceipt { ownerHash: string; proofHash: string; state: 'pending' | 'deleted'; createdAt: string }
export interface DeletionDependencies {
  authenticate(token: string): Promise<{ id: string; anonymous: boolean; google: boolean } | null>;
  find(operation: string): Promise<DeletionReceipt | null>;
  begin(operation: string, ownerHash: string, proofHash: string): Promise<DeletionReceipt>;
  complete(operation: string, ownerHash: string, proofHash: string): Promise<void>;
  removeUser(owner: string): Promise<void>;
  userExists(owner: string): Promise<boolean>;
  now?: () => number; allowedOrigins?: string[];
}
export function deletionRequest(value: unknown): DeletionRequest | null {
  if (!isRecord(value) || Object.keys(value).some(k => !['ownerId','operationId','proof','confirmation'].includes(k))
    || !isUserId(value.ownerId) || !isUserId(value.operationId) || typeof value.proof !== 'string' || !/^[a-f0-9]{64}$/.test(value.proof)
    || value.confirmation !== 'DELETE') return null;
  return value as unknown as DeletionRequest;
}
export async function deletionHash(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2,'0')).join('');
}
/** Called only AFTER Auth /user has verified this exact bearer. Decoding alone never authorizes deletion. */
export function recentlyAuthenticated(token: string, userId: string, now: number): boolean {
  try {
    const encoded = token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    const claims = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'=')));
    return claims.sub === userId && claims.exp > now/1000 && Array.isArray(claims.amr)
      && claims.amr.some((entry: unknown) => isRecord(entry) && entry.method === 'oauth' && typeof entry.timestamp === 'number'
        && entry.timestamp <= now/1000 + 60 && entry.timestamp >= now/1000 - 600);
  } catch { return false; }
}
export function createAccountDeletion(deps: DeletionDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const permitted = !origin || deps.allowedOrigins?.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const headers: Record<string,string> = { 'Cache-Control':'no-store', 'Content-Type':'application/json', Vary:'Origin' };
    if (origin && permitted) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (status: number, body: unknown) => Response.json(body,{status,headers});
    const failure = (status: number, code: string, notDeleted = false) => reply(status,{error:{code,notDeleted}});
    if (!permitted) return failure(403,'origin_not_allowed',true);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}});
    if (request.method !== 'POST') return failure(405,'method_not_allowed',true);
    if (!(request.headers.get('content-type')??'').toLowerCase().startsWith('application/json') || Number(request.headers.get('content-length'))>2048) return failure(400,'invalid_request',true);
    let input: DeletionRequest | null;
    try { input = deletionRequest(await deadline(signal=>boundedJson(request.body,2048,signal),3000)); }
    catch { return failure(400,'invalid_request',true); }
    if (!input) return failure(400,'invalid_request',true);
    const now = deps.now?.() ?? Date.now();
    try {
      const ownerHash = await deletionHash(`${input.ownerId}:${input.operationId}`); const proofHash = await deletionHash(input.proof);
      let receipt = await deps.find(input.operationId);
      if (receipt && (receipt.ownerHash !== ownerHash || receipt.proofHash !== proofHash)) return failure(403,'request_mismatch');
      if (receipt?.state === 'deleted') return reply(200,{deleted:true,ownerId:input.ownerId,operationId:input.operationId});
      if (!receipt) {
        const token = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9._~-]{20,8192})$/)?.[1];
        if (!token) return failure(401,'sign_in_required');
        const user = await deps.authenticate(token);
        if (!user || user.id !== input.ownerId || user.anonymous) return failure(401,'sign_in_required');
        if (!user.google || !recentlyAuthenticated(token,user.id,now)) return failure(403,'reauth_required',true);
        receipt = await deps.begin(input.operationId,ownerHash,proofHash);
        if (receipt.ownerHash !== ownerHash || receipt.proofHash !== proofHash) return failure(403,'request_mismatch');
      }
      if (receipt.state !== 'deleted') {
        // A durable, previously authenticated intent permits recovery if the user
        // was deleted but its success response never reached the device.
        if (await deps.userExists(input.ownerId)) {
          if (now - Date.parse(receipt.createdAt) > 15*60*1000) {
            const token = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9._~-]{20,8192})$/)?.[1];
            const user = token ? await deps.authenticate(token) : null;
            if (!token || !user || user.id !== input.ownerId || user.anonymous || !user.google || !recentlyAuthenticated(token,user.id,now)) return failure(403,'reauth_required');
          }
          await deps.removeUser(input.ownerId);
          if (await deps.userExists(input.ownerId)) return failure(503,'deletion_pending');
        }
        await deps.complete(input.operationId,ownerHash,proofHash);
      }
      return reply(200,{deleted:true,ownerId:input.ownerId,operationId:input.operationId});
    } catch { return failure(503,'deletion_pending'); }
  };
}
