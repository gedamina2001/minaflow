// Runs against disposable PostgreSQL via PGlite, not the hosted Supabase project.
// Pass an installed @electric-sql/pglite/dist/index.js path as the first argument.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
let checks = 0;
const equal = (actual, expected) => { assert.equal(actual, expected); checks++; };
const denied = async sql => { await assert.rejects(() => db.exec(sql)); checks++; };
const count = async table => (await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n;

try {
  // Minimal stand-ins for the roles and auth.uid() supplied by Supabase.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${alice}'), ('${bob}');
  `);
  await db.exec(await readFile(new URL('../migrations/202611190001_initial_schema.sql', import.meta.url), 'utf8'));

  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${alice}';`);
  await db.exec(`
    insert into public.user_settings (display_name) values ('Alice');
    insert into public.periods (start_date, end_date) values ('2026-10-01', '2026-10-05');
    insert into public.daily_check_ins (entry_date, symptoms, pain_level)
      values ('2026-10-02', array['cramps'], 4);
  `);
  for (const table of ['user_settings', 'periods', 'daily_check_ins']) equal(await count(table), 1);
  await denied(`insert into public.periods (start_date, end_date) values ('2026-10-10', '2026-10-09')`);
  await denied(`insert into public.daily_check_ins (entry_date) values ('2026-10-02')`);
  await denied(`insert into public.daily_check_ins (entry_date, pain_level) values ('2026-10-03', 11)`);
  await denied(`insert into public.daily_check_ins (entry_date, symptoms) values ('2026-10-03', array['invalid'])`);
  await denied(`insert into public.daily_check_ins (entry_date, symptoms) values ('2026-10-03', array[null]::text[])`);
  await db.exec(`insert into public.periods (start_date) values ('2026-11-01')`);
  await denied(`insert into public.periods (start_date) values ('2026-12-01')`);

  for (const table of ['user_settings', 'periods', 'daily_check_ins']) {
    await denied(`update public.${table} set user_id = '${bob}'`);
    await denied(`truncate public.${table}`);
  }

  await db.exec(`set request.jwt.claim.sub = '${bob}'`);
  for (const table of ['user_settings', 'periods', 'daily_check_ins']) {
    equal(await count(table), 0);
    equal((await db.query(`update public.${table} set updated_at = now() returning user_id`)).rows.length, 0);
    equal((await db.query(`delete from public.${table} returning user_id`)).rows.length, 0);
  }
  await denied(`insert into public.user_settings (user_id) values ('${alice}')`);
  await denied(`insert into public.periods (user_id, start_date) values ('${alice}', '2026-09-01')`);
  await denied(`insert into public.daily_check_ins (user_id, entry_date) values ('${alice}', '2026-09-01')`);
  await db.exec(`insert into public.user_settings (display_name) values ('Bob')`);

  await db.exec(`set role anon; set request.jwt.claim.sub = '';`);
  for (const table of ['user_settings', 'periods', 'daily_check_ins']) {
    await denied(`select * from public.${table}`);
    await denied(`delete from public.${table}`);
  }

  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${alice}'`);
  for (const table of ['user_settings', 'periods', 'daily_check_ins']) {
    equal((await db.query(`update public.${table} set updated_at = '2000-01-01' returning updated_at > '2020-01-01' as stamped`)).rows.every(row => row.stamped), true);
  }
  await db.exec(`delete from public.daily_check_ins;`);
  equal(await count('daily_check_ins'), 0);
  await db.exec(`reset role; delete from auth.users where id = '${alice}';`);
  equal(await count('user_settings'), 1); // Bob survives Alice's account deletion.
  equal(await count('periods'), 0);
  equal(await count('daily_check_ins'), 0);
  console.log(`Passed ${checks} schema, constraint, access-control, and cascade checks.`);
} finally {
  await db.close();
}
