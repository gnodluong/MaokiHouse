// Concatenates every migration, in order, into one SQL file for a brand-new Supabase project.
// (Existing projects: run only the migrations newer than the ones already applied.)
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';

const files = (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
const parts = [];
for (const file of files) parts.push(`-- ===== ${file} =====\n${await readFile(`supabase/migrations/${file}`, 'utf8').then(text => text.trim())}\n`);
await mkdir('dist-sql', { recursive: true });
await writeFile('dist-sql/maoki-all-migrations.sql', parts.join('\n'));
console.log(`Wrote dist-sql/maoki-all-migrations.sql (${files.length} migrations)`);
