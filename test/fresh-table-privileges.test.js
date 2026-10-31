import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, expect, test } from "vitest";

const read = (path) => readFileSync(path, "utf8");
const schema = read("supabase/schema.sql");
const pushMigration = read("supabase/migrations/20260719_daily_briefing_push.sql");
const crud = ["select", "insert", "update", "delete"];
// Browser grants follow existing RLS operations; server grants follow Edge Function queries.
const access = {
  households: { authenticated: ["select"] },
  household_members: { authenticated: ["select"], service_role: ["select"] },
  events: { authenticated: crud, service_role: ["select"] },
  babies: { authenticated: crud, service_role: ["select"] },
  calendar_members: { authenticated: crud },
  growth_entries: { authenticated: crud, service_role: ["select"] },
  household_wallpapers: { authenticated: crud },
  feature_requests: { authenticated: ["select", "insert", "update"] },
  family_todos: { authenticated: crud },
  notifications: { authenticated: ["select", "update", "delete"], service_role: ["select", "insert", "update"] },
  baby_ai_profiles: { authenticated: crud, service_role: ["select"] },
  baby_ai_strategy_drafts: { authenticated: ["select"], service_role: ["select", "insert"] },
  baby_ai_refresh_queue: { authenticated: ["select"], service_role: crud },
  push_subscriptions: { service_role: crud },
  private_entries: { authenticated: crud },
  household_backup_imports: { authenticated: ["select", "insert", "delete"] },
  family_trips: { authenticated: ["select", "insert", "update"] },
  parenting_questions: { authenticated: ["select"] },
  family_sleep_sessions: { authenticated: ["select"] },
  // These tables are intentionally reached through checked SECURITY DEFINER RPCs.
  platform_admins: {}, app_activity_logs: {}, platform_admin_audit_logs: {}, household_join_attempts: {},
};
const creations = (sql) => [...sql.matchAll(/create table(?: if not exists)? public\.(\w+)/gi)].map((match) => match[1]);
const migrations = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql"));
const creationFiles = ["supabase/schema.sql", ...migrations.map((name) => `supabase/migrations/${name}`)]
  .filter((path) => creations(read(path)).length);

test.each(creationFiles)("%s declares only the intended table privileges alongside RLS", (path) => {
  const sql = read(path);
  expect(sql).not.toMatch(/grant\s+all\b|grant[\s\S]*?on\s+all\s+tables\s+in\s+schema/i);
  for (const table of creations(sql)) {
    expect(access[table], `${table} needs an explicit access decision`).toBeDefined();
    expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    const grants = [...sql.matchAll(new RegExp(`grant\\s+([\\w,\\s]+)\\s+on\\s+(?:table\\s+)?public\\.${table}\\s+to\\s+([^;]+);`, "gi"))];
    for (const role of ["anon", "authenticated", "service_role"]) {
      const operations = grants.filter(([, , roles]) => roles.split(",").map((item) => item.trim()).includes(role))
        .flatMap(([, privileges]) => privileges.split(",").map((item) => item.trim().toLowerCase()));
      expect([...new Set(operations)].sort(), `${path}: ${table}/${role}`).toEqual([...(access[table][role] || [])].sort());
    }
  }
});

const owner = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";
const outsider = "33333333-3333-4333-8333-333333333333";
const home = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherHome = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const baby = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
let db, todoDb;

async function bootstrap() {
  const database = new PGlite(); // In-memory only: no credentials, network or existing database.
  await database.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated, anon, service_role;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key, bucket_id text, name text);
    create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
    -- PGlite lacks pgcrypto; this stand-in is only for synthetic invite defaults.
    create function public.gen_random_bytes(n integer) returns bytea language sql volatile as $$
      select substring(decode(repeat(replace(gen_random_uuid()::text,'-',''),n),'hex') from 1 for n) $$;
  `);
  return database;
}

async function asRole(database, role, user, sql) {
  await database.exec(`set role ${role}; select set_config('request.jwt.claim.sub','${user || ""}',false);`);
  try { return await database.query(sql); } finally { await database.exec("reset role"); }
}
const userQuery = (user, sql) => asRole(db, "authenticated", user, sql);
const seed = `insert into auth.users values ('${owner}'),('${member}'),('${outsider}');
  insert into households(id,name,owner_id) values ('${home}','합성 가족','${owner}'),('${otherHome}','다른 합성 가족','${outsider}');
  insert into household_members(household_id,user_id,role) values ('${home}','${owner}','owner'),('${home}','${member}','member'),('${otherHome}','${outsider}','owner');`;

beforeAll(async () => {
  db = await bootstrap();
  await db.exec(schema.replace("create extension if not exists pgcrypto;", ""));
  await db.exec(pushMigration);
  await db.exec(seed);
  await db.exec(`insert into babies(id,household_id,name,birth_date,created_by) values ('${baby}','${home}','합성 아기','2000-01-01','${owner}');`);

  todoDb = await bootstrap();
  // Independent historical table-creation path, with later private-todo RLS applied.
  await todoDb.exec(schema.slice(schema.indexOf("create table public.households"), schema.indexOf("create table public.family_todos")));
  await todoDb.exec(`create function public.is_household_member(h uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from household_members where household_id=h and user_id=auth.uid()) $$;`);
  await todoDb.exec(read("supabase/migrations/20260716_family_todos.sql"));
  await todoDb.exec(read("supabase/migrations/20260811000000_private_family_todos.sql"));
  await todoDb.exec(seed);
}, 30000);
afterAll(async () => { await db?.close(); await todoDb?.close(); });

test("fresh schema has exact role privileges without any automatic table grants", async () => {
  const tables = [...creations(schema), ...creations(pushMigration)];
  const result = await db.query(`select c.relname as name, r.role, p.operation,
    has_table_privilege(r.role,c.oid,p.operation) as allowed
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join (values ('anon'),('authenticated'),('service_role')) r(role)
    cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(operation)
    where n.nspname='public' and c.relkind='r'`);
  expect(creations(schema)).toHaveLength(13);
  expect(result.rows).toHaveLength(tables.length * 3 * 7);
  for (const row of result.rows) expect(row.allowed, `${row.name}/${row.role}/${row.operation}`)
    .toBe((access[row.name][row.role] || []).includes(row.operation.toLowerCase()));
  const rls = await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity");
  expect(rls.rows).toEqual([]);
  for (const table of tables) await expect(asRole(db, "anon", null, `select * from ${table}`)).rejects.toThrow("permission denied");
});

test("member can create/read/update/delete their family todo; outsider and private-row access fail", async () => {
  for (const database of [db, todoDb]) {
    const query = (user, sql) => asRole(database, "authenticated", user, sql);
    await query(owner, `insert into family_todos(household_id,title,visibility,created_by) values ('${home}','비공개 합성','private','${owner}')`);
    const created = await query(member, `insert into family_todos(household_id,title,created_by) values ('${home}','합성 할 일','${member}') returning id`);
    const id = created.rows[0].id;
    expect((await query(member, "select title from family_todos")).rows).toEqual([{ title: "합성 할 일" }]);
    expect((await query(outsider, "select * from family_todos")).rows).toEqual([]);
    await expect(query(outsider, `insert into family_todos(household_id,title,created_by) values ('${home}','침입','${outsider}')`)).rejects.toThrow("row-level security");
    expect((await query(member, `update family_todos set title='완료' where id='${id}' returning id`)).rows).toHaveLength(1);
    expect((await query(member, `delete from family_todos where id='${id}' returning id`)).rows).toHaveLength(1);
    await expect(query(member, `insert into family_todos(household_id,title,created_by) values ('${home}','위조','${owner}')`)).rejects.toThrow("row-level security");
  }
});

test("household and membership changes remain RPC-only, and wallpaper writes remain owner-only", async () => {
  expect((await userQuery(member, "select id from households")).rows).toEqual([{ id: home }]);
  await expect(userQuery(member, `update household_members set role='owner' where user_id='${member}'`)).rejects.toThrow("permission denied");
  await expect(userQuery(member, `insert into households(name,owner_id) values ('직접 생성','${member}')`)).rejects.toThrow("permission denied");
  const insert = (user) => `insert into household_wallpapers(household_id,surface,photo_path,created_by) values ('${home}','growth','${home}/wallpapers/growth/synthetic.jpg','${user}')`;
  await expect(userQuery(member, insert(member))).rejects.toThrow("row-level security");
  await userQuery(owner, insert(owner));
  expect((await userQuery(member, "select surface from household_wallpapers")).rows).toEqual([{ surface: "growth" }]);
});

test("feature submission, owner review and notification inbox boundaries remain enforced", async () => {
  await userQuery(member, `insert into feature_requests(household_id,content,created_by) values ('${home}','합성 요청','${member}')`);
  expect((await userQuery(member, "select * from feature_requests")).rows).toEqual([]);
  expect((await userQuery(owner, "update feature_requests set status='planned' returning id")).rows).toHaveLength(1);
  await expect(userQuery(owner, "delete from feature_requests")).rejects.toThrow("permission denied");
  await db.exec(`insert into notifications(household_id,user_id,title,dedupe_key) values ('${home}','${owner}','합성 알림','owner'),('${home}','${member}','합성 알림','member')`);
  expect((await userQuery(member, "select dedupe_key from notifications")).rows).toEqual([{ dedupe_key: "member" }]);
  expect((await userQuery(member, "update notifications set read_at=now() returning dedupe_key")).rows).toEqual([{ dedupe_key: "member" }]);
  await expect(userQuery(member, `insert into notifications(household_id,user_id,title,dedupe_key) values ('${home}','${member}','위조','forged')`)).rejects.toThrow("permission denied");
});

test("server role can process AI work but gains no client-unneeded writes", async () => {
  await asRole(db, "service_role", null, `insert into baby_ai_refresh_queue(baby_id,household_id,due_at) values ('${baby}','${home}',now())`);
  expect((await userQuery(member, "select baby_id from baby_ai_refresh_queue")).rows).toHaveLength(1);
  expect((await userQuery(outsider, "select * from baby_ai_refresh_queue")).rows).toEqual([]);
  await expect(userQuery(member, "delete from baby_ai_refresh_queue")).rejects.toThrow("permission denied");
  await expect(asRole(db, "service_role", null, "delete from events")).rejects.toThrow("permission denied");
  await asRole(db, "service_role", null, "delete from baby_ai_refresh_queue");
});

test("only server role can manage push subscriptions and create notification inbox rows", async () => {
  await expect(userQuery(member, "select * from push_subscriptions")).rejects.toThrow("permission denied");
  const created = await asRole(db, "service_role", null, `insert into push_subscriptions(user_id,household_id,endpoint,p256dh,auth)
    values ('${member}','${home}','https://example.invalid/synthetic-push','synthetic-public-key-only','synthetic-auth-only') returning id`);
  const id = created.rows[0].id;
  expect((await asRole(db, "service_role", null, `update push_subscriptions set enabled=false where id='${id}' returning id`)).rows).toHaveLength(1);
  await asRole(db, "service_role", null, `delete from push_subscriptions where id='${id}'`);
  await asRole(db, "service_role", null, `insert into notifications(household_id,user_id,title,dedupe_key) values ('${home}','${member}','서버 합성 알림','server')`);
  expect((await asRole(db, "service_role", null, "update notifications set delivered_at=now() where dedupe_key='server' returning id")).rows).toHaveLength(1);
  await expect(asRole(db, "service_role", null, "delete from notifications")).rejects.toThrow("permission denied");
});
