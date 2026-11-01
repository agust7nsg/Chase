import { readFile } from 'node:fs/promises';
const project='vzjekkgyrdxzlhaupnrw';
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token) throw new Error('Add SUPABASE_ACCESS_TOKEN as a GitHub Actions secret.');
const query=await readFile(new URL('../supabase/migrations/202611010001_collection_sync.sql',import.meta.url),'utf8');
const result=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{
 method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(60000)
});
if(!result.ok) throw new Error(`Collection deployment failed (HTTP ${result.status}). Check project database-query permissions; no response body or secret is logged.`);
console.log('Collection sync migration applied. Existing scanner and collection data were preserved.');
