import { boundedJson, deadline, isRecord, isUserId } from './hostedProtocol.ts';
import type { DeletionDependencies, DeletionReceipt } from './accountDeletion.ts';
export function deletionDependencies(url: string, serviceKey: string, fetcher: typeof fetch = fetch): DeletionDependencies {
  const project = new URL(url);
  if (project.protocol!=='https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(project.hostname) || project.username || project.password || project.port || !['','/'].includes(project.pathname) || project.search || project.hash || !serviceKey) throw new Error('Invalid deletion server configuration.');
  const root=project.origin;
  const headers={apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'};
  const rpc=async(name:string,body:Record<string,unknown>)=>deadline(async signal=>{
    const response=await fetcher(`${root}/rest/v1/rpc/${name}`,{method:'POST',redirect:'error',headers,body:JSON.stringify(body),signal});
    if(!response.ok){void response.body?.cancel().catch(()=>{});throw new Error('Deletion receipt unavailable.');}
    return boundedJson(response.body,8192,signal);
  },5000);
  const parse=(value:unknown):DeletionReceipt=>{
    if(!isRecord(value)||!['pending','deleted'].includes(String(value.state))||typeof value.owner_hash!=='string'||typeof value.proof_hash!=='string'||typeof value.created_at!=='string'||!Number.isFinite(Date.parse(value.created_at)))throw new Error('Invalid deletion receipt.');
    return {ownerHash:value.owner_hash,proofHash:value.proof_hash,state:value.state as 'pending'|'deleted',createdAt:value.created_at};
  };
  return {
    authenticate:token=>deadline(async signal=>{
      const result=await fetcher(`${root}/auth/v1/user`,{redirect:'error',headers:{apikey:serviceKey,Authorization:`Bearer ${token}`},signal});
      if([401,403].includes(result.status)){void result.body?.cancel().catch(()=>{});return null;}
      if(!result.ok){void result.body?.cancel().catch(()=>{});throw new Error('Auth unavailable.');}
      const raw=await boundedJson(result.body,65536,signal);
      const user=isRecord(raw)&&isRecord(raw.user)?raw.user:raw;
      if(!isRecord(user)||!isUserId(user.id)||user.role!=='authenticated')return null;
      return {id:user.id,anonymous:user.is_anonymous===true,google:Array.isArray(user.identities)&&user.identities.some(identity=>isRecord(identity)&&identity.provider==='google')};
    },5000),
    find:async operation=>{const value=await rpc('account_deletion_find',{p_operation:operation});return value===null?null:parse(value);},
    begin:async(operation,ownerHash,proofHash)=>parse(await rpc('account_deletion_begin',{p_operation:operation,p_owner_hash:ownerHash,p_proof_hash:proofHash})),
    complete:async(operation,ownerHash,proofHash)=>{const value=await rpc('account_deletion_complete',{p_operation:operation,p_owner_hash:ownerHash,p_proof_hash:proofHash});if(!isRecord(value)||value.saved!==true)throw new Error('Deletion confirmation pending.');},
    userExists:owner=>deadline(async signal=>{
      const response=await fetcher(`${root}/auth/v1/admin/users/${owner}`,{headers,redirect:'error',signal});
      if(response.status===404){void response.body?.cancel().catch(()=>{});return false;}
      if(!response.ok){void response.body?.cancel().catch(()=>{});throw new Error('User status unavailable.');}
      const raw=await boundedJson(response.body,65536,signal);const value=isRecord(raw)&&isRecord(raw.user)?raw.user:raw;if(!isRecord(value)||value.id!==owner)throw new Error('Unexpected user status.');return true;
    },5000),
    removeUser:owner=>deadline(async signal=>{
      const response=await fetcher(`${root}/auth/v1/admin/users/${owner}`,{method:'DELETE',headers,redirect:'error',signal,body:JSON.stringify({should_soft_delete:false})});
      void response.body?.cancel().catch(()=>{});if(!response.ok&&response.status!==404)throw new Error('Deletion needs a retry.');
    },10000),
  };
}
