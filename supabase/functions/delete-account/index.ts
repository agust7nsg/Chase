import { createAccountDeletion } from '../_shared/accountDeletion.ts';
import { deletionDependencies } from '../_shared/accountDeletionStore.ts';
declare const Deno: {env:{get(name:string):string|undefined};serve(handler:(request:Request)=>Promise<Response>):void};
const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
Deno.serve(url&&key?createAccountDeletion({...deletionDependencies(url,key),allowedOrigins:(Deno.env.get('ACCOUNT_DELETE_ALLOWED_ORIGINS')??'').split(',').map(value=>value.trim()).filter(Boolean)})
 :async()=>Response.json({error:{code:'not_configured',notDeleted:true}},{status:503,headers:{'Cache-Control':'no-store'}}));
