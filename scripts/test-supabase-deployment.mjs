import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { migrationPlan,statusSQL,permissionsSQL,verifySchema } from './supabase-project.mjs';
const plan=await migrationPlan();
const bootstrap=`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`;
const fresh=new PGlite();
try {
 await fresh.exec(bootstrap); await fresh.exec(plan.query);
 const state=(await fresh.query(statusSQL)).rows[0]; verifySchema(state,(await fresh.query(permissionsSQL)).rows[0]);
 const rows=(await fresh.query('select * from supabase_migrations.schema_migrations')).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].version,plan.version);assert.equal(rows[0].statements[0],plan.source);
 console.log('PASS atomic deployment installs schema/RLS/permissions and matching CLI history');
 await assert.rejects(()=>fresh.exec(plan.query),/already applied/);await fresh.exec('rollback');
 assert.equal((await fresh.query('select count(*)::int as count from supabase_migrations.schema_migrations')).rows[0].count,1);
 console.log('PASS repeated deployment cannot reapply migration or duplicate history');
} finally {await fresh.close();}
const existing=new PGlite();
try {
 await existing.exec(bootstrap);await existing.exec('create table public.maoki_records(id integer primary key); insert into public.maoki_records values(42)');
 await assert.rejects(()=>existing.exec(plan.query),/already exist/);await existing.exec('rollback');
 assert.equal((await existing.query('select id from public.maoki_records')).rows[0].id,42);
 assert.equal((await existing.query("select to_regclass('supabase_migrations.schema_migrations') as relation")).rows[0].relation,null);
 console.log('PASS schema collision aborts the whole deployment and preserves existing records');
} finally {await existing.close();}
