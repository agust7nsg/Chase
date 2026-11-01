import { createAccountDeletion, type DeletionReceipt } from '../functions/_shared/accountDeletion.ts';
declare const Deno: { test(name: string, run: () => Promise<void>): void };
Deno.test('account deletion runs and recovers in the actual Deno WebCrypto runtime', async () => {
  const ownerId='12345678-1234-1234-1234-123456789abc',operationId='12345678-1234-1234-1234-123456789def';
  let receipt: DeletionReceipt | null=null,exists=true,removals=0;
  const token=`eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({sub:ownerId,exp:Date.now()/1000+3600,amr:[{method:'oauth',timestamp:Date.now()/1000}]})).replace(/=/g,'')}.fixture`;
  const handler=createAccountDeletion({authenticate:async()=>({id:ownerId,anonymous:false,google:true}),find:async()=>receipt,
    begin:async(_op,ownerHash,proofHash)=>receipt={ownerHash,proofHash,state:'pending',createdAt:new Date().toISOString()},
    complete:async()=>{receipt!.state='deleted';},removeUser:async()=>{exists=false;removals++;},userExists:async()=>exists});
  const request=(authenticated:boolean)=>new Request('https://test.invalid/delete-account',{method:'POST',headers:{'Content-Type':'application/json',...(authenticated?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({ownerId,operationId,proof:'a'.repeat(64),confirmation:'DELETE'})});
  const first=await handler(request(true)),replay=await handler(request(false));
  if(first.status!==200||replay.status!==200||removals!==1||!(await replay.json()).deleted)throw new Error('Deno deletion recovery failed');
});
