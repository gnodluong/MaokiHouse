// Shared by the SQL Editor guide and the Management API deployment command.
// Both routes apply the same reviewed source and exact CLI migration history.
const literal = value => "'" + value.replaceAll("'", "''") + "'";
export function bootstrapSQL(version, name, source) {
  if (!/^\d+$/.test(version) || !/\bbegin;/.test(source) || !/commit;\s*$/.test(source)) throw new Error('Invalid migration');
  const body = source.replace(/\bbegin;/, '').replace(/commit;\s*$/, '');
  return `begin;
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
}
