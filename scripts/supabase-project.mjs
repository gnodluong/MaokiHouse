import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const projectRef = 'msucrkkxuplgijxanzxu';
export const productionURL = 'https://maokihousemvc.vercel.app';
export const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);
const literal = value => "'" + value.replaceAll("'", "''") + "'";
export async function migrationPlan() {
  const files = (await readdir(migrationDirectory)).filter(name => /^\d+_maoki_workspace\.sql$/.test(name));
  if (files.length !== 1) throw new Error('Expected exactly one MaokiHouse initial migration');
  const file = files[0]; const source = await readFile(new URL(file, migrationDirectory), 'utf8');
  const match = file.match(/^(\d+)_(.+)\.sql$/); const version = match[1]; const name = match[2];
  if (!/\bbegin;/.test(source) || !/commit;\s*$/.test(source)) throw new Error('Migration must be a complete transaction');
  const body = source.replace(/\bbegin;/, '').replace(/commit;\s*$/, '');
  const hash = createHash('sha256').update(source).digest('hex');
  // Store the reviewed source/version in the standard CLI migration history in
  // the same transaction. A partial/previous manual install is never overwritten.
  const query = `begin;
select pg_advisory_xact_lock(hashtextextended('maokihouse_initial_schema', 17));
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text);
revoke all on supabase_migrations.schema_migrations from public, anon, authenticated;
do $maoki_preflight$ begin
  if exists(select 1 from supabase_migrations.schema_migrations where version=${literal(version)}) then
    raise exception 'MaokiHouse migration already applied; run status instead';
  end if;
  if exists(select 1 from pg_namespace where nspname='maoki_private')
     or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'maoki\\_%' escape '\\') then
    raise exception 'MaokiHouse objects already exist without matching migration history; manual review required';
  end if;
end $maoki_preflight$;
${body}
insert into supabase_migrations.schema_migrations(version,statements,name)
values(${literal(version)},array[${literal(source)}],${literal(name)});
commit;`;
  return { file, version, name, source, hash, query };
}
export const statusSQL = `select
  (select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity) order by c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('maoki_workspaces','maoki_members','maoki_records','maoki_activity')) as tables,
  to_regprocedure('public.maoki_workspace(text,text,uuid,jsonb)') is not null as workspace_rpc,
  to_regprocedure('public.maoki_public(text,uuid,text,jsonb)') is not null as public_rpc,
  to_regclass('supabase_migrations.schema_migrations') is not null as history_exists;`;
export const permissionsSQL = `select
  has_function_privilege('anon','public.maoki_workspace(text,text,uuid,jsonb)','execute') as anon_workspace,
  has_function_privilege('authenticated','public.maoki_workspace(text,text,uuid,jsonb)','execute') as authenticated_workspace,
  has_function_privilege('anon','public.maoki_public(text,uuid,text,jsonb)','execute') as anon_public,
  has_table_privilege('anon','public.maoki_records','select') as anon_records,
  has_table_privilege('authenticated','public.maoki_records','insert,update,delete') as direct_writes,
  (select count(*)=2 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('maoki_workspace','maoki_public') and not p.prosecdef) as invoker_wrappers;`;
export function verifySchema(status, permissions) {
  if (status.tables.length !== 4 || status.tables.some(row=>!row.rls) || !status.workspace_rpc || !status.public_rpc) throw new Error('Missing MaokiHouse schema/RLS/RPC');
  if (permissions.anon_workspace || !permissions.authenticated_workspace || !permissions.anon_public || permissions.anon_records || permissions.direct_writes || !permissions.invoker_wrappers) throw new Error('Unexpected MaokiHouse database permissions');
}
async function main() {
  const action = process.argv[2] || 'plan';
  if (!['plan','status','apply'].includes(action)) throw new Error('Use plan, status, or apply');
  const plan = await migrationPlan();
  console.log(JSON.stringify({ action, projectRef, migration:plan.file, sha256:plan.hash, productionURL }));
  if (action === 'plan') return;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('Missing SUPABASE_ACCESS_TOKEN. Add a scoped token securely in environment settings, never in chat or VITE_* variables.');
  const api = async (path, method='GET', body) => {
    let response;
    try { response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}${path}`, { method, signal:AbortSignal.timeout(60000), headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }, ...(body ? { body:JSON.stringify(body) } : {}) }); }
    catch { throw new Error('Cannot reach api.supabase.com; check the applied environment network policy.'); }
    if (!response.ok) throw new Error(`Supabase Management API HTTP ${response.status}; check project-scoped permissions. No credential or response body was logged.`);
    const value=await response.text(); return value ? JSON.parse(value) : null;
  };
  const query = (sql, readOnly=true) => api('/database/query','POST',{query:sql,read_only:readOnly});
  const project=await api('');
  if ((project.ref || project.id)!==projectRef || project.status!=='ACTIVE_HEALTHY') throw new Error('Project identity/status verification failed');
  let status=(await query(statusSQL))[0];
  let applied=false;
  if (status.history_exists) {
    const rows=await query(`select statements,name from supabase_migrations.schema_migrations where version=${literal(plan.version)};`);
    if (rows.length) {
      if (rows[0].name!==plan.name || !rows[0].statements?.includes(plan.source)) throw new Error('Remote migration history differs from reviewed local source; manual review required');
      applied=true;
    }
  }
  if (action==='apply' && !applied) {
    if (status.tables.length || status.workspace_rpc || status.public_rpc) throw new Error('Existing MaokiHouse schema has no matching history; refusing to overwrite it');
    await query(plan.query,false);
    status=(await query(statusSQL))[0]; applied=true;
  }
  if (applied) verifySchema(status,(await query(permissionsSQL))[0]);
  console.log(JSON.stringify({ projectRef,status:project.status,migrationApplied:applied,tables:status.tables,workspaceRPC:status.workspace_rpc,publicRPC:status.public_rpc }));
  if (action==='apply') {
    if (!applied) throw new Error('Migration application not confirmed');
    const auth=await api('/config/auth');
    const redirects=[...new Set([...(auth.uri_allow_list || '').split(',').map(x=>x.trim()).filter(Boolean),`${productionURL}/admin`,`${productionURL}/admin?invite=*`])];
    await api('/config/auth','PATCH',{site_url:productionURL,uri_allow_list:redirects.join(',')});
    const saved=await api('/config/auth');
    if (saved.site_url!==productionURL || !redirects.every(url=>saved.uri_allow_list?.split(',').includes(url))) throw new Error('Auth URL update could not be verified');
    const advisors=await api('/advisors/security');
    const items=Array.isArray(advisors)?advisors:advisors?.lints || [];
    console.log(JSON.stringify({authSiteURL:saved.site_url,authRedirectsVerified:true,securityAdvisorFindings:items.length}));
    if (items.some(item=>JSON.stringify(item).includes('maoki_') && ['ERROR','WARN'].includes(item.level))) throw new Error('Security advisor findings affect MaokiHouse; review in the Supabase dashboard');
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) main().catch(error=>{console.error(error.message);process.exitCode=1;});
