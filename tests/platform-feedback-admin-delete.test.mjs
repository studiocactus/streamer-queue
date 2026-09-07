import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const migrationUrl = new URL('../supabase/migrations/0050_admin_delete_platform_feedback.sql', import.meta.url)

test('0050 only allows platform administrators to delete feedback', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  const admin = '00000000-0000-0000-0000-000000000001'
  const user = '00000000-0000-0000-0000-000000000002'
  const feedback = '00000000-0000-0000-0000-000000000003'
  await db.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table platform_admins(user_id uuid primary key);
    create function is_platform_admin(p_user_id uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from platform_admins where user_id=p_user_id) $$;
    create table platform_feedback(id uuid primary key, message text not null);
    grant usage on schema public, auth to authenticated;
    grant select, delete on platform_feedback to authenticated;
    alter table platform_feedback enable row level security;
    create policy "Admins can view all feedback" on platform_feedback for select using (is_platform_admin(auth.uid()));
    insert into platform_admins values ('${admin}');
    insert into platform_feedback values ('${feedback}', 'Mensagem de teste');
  `)
  await db.exec(await readFile(migrationUrl, 'utf8'))
  const asUser = async (id, sql) => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
    await db.exec('set role authenticated')
    try { return await db.query(sql) } finally { await db.exec('reset role') }
  }
  assert.equal((await asUser(user, `delete from platform_feedback where id='${feedback}' returning id`)).rows.length, 0)
  assert.equal((await asUser(admin, `delete from platform_feedback where id='${feedback}' returning id`)).rows.length, 1)
})
