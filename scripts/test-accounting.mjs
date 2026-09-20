import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import {storageStub} from '../src/restore-core.ts'

const db = new PGlite()
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    create table public.app_owner(user_id uuid not null references auth.users(id));
    insert into auth.users values('00000000-0000-4000-8000-000000000001');
    insert into public.app_owner select id from auth.users;
    grant usage on schema auth to authenticated;
    grant select on public.app_owner to authenticated;
  `)
  await db.exec(storageStub)
  for (const file of ['001_core.sql','002_commands.sql','003_masters.sql','004_read_api.sql','005_documents_backup.sql','006_backup_utc.sql','007_lossless_backup_json.sql']) {
    await db.exec(await readFile(new URL(`../db/accounting/${file}`,import.meta.url),'utf8'))
  }
  const results=await db.exec(await readFile(new URL('../db/accounting/test_engine.sql',import.meta.url),'utf8'))
  for (const r of results) if (r.rows?.length) console.log(JSON.stringify(r.rows))
  console.log('PASS: exact migrations and engine regression suite')
} catch (error) {
  console.error(JSON.stringify({message:error.message,code:error.code,where:error.where,detail:error.detail,position:error.position}))
  process.exitCode=1
} finally { await db.close() }
