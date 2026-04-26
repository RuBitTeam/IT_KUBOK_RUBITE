
-- =========================================================
-- ENUMS
-- =========================================================
create type public.workspace_role as enum ('owner','admin','editor','viewer');

-- =========================================================
-- WORKSPACES
-- =========================================================
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  owner_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.workspaces enable row level security;

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

-- =========================================================
-- WORKSPACE USERS
-- =========================================================
create table public.workspace_users (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  role public.workspace_role not null default 'editor',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
alter table public.workspace_users enable row level security;
create index workspace_users_user_idx on public.workspace_users(user_id);
create index workspace_users_ws_idx on public.workspace_users(workspace_id);

-- =========================================================
-- HELPER FUNCTIONS (security definer to avoid RLS recursion)
-- =========================================================
create or replace function public.is_workspace_member(_workspace_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.workspace_users
    where workspace_id = _workspace_id and user_id = _user_id
  );
$$;

create or replace function public.workspace_role_of(_workspace_id uuid, _user_id uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.workspace_users
  where workspace_id = _workspace_id and user_id = _user_id
  limit 1;
$$;

create or replace function public.can_edit_workspace(_workspace_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.workspace_role_of(_workspace_id, _user_id) in ('owner','admin','editor');
$$;

create or replace function public.can_admin_workspace(_workspace_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.workspace_role_of(_workspace_id, _user_id) in ('owner','admin');
$$;

-- =========================================================
-- WORKSPACES RLS
-- =========================================================
create policy "Members view workspaces"
on public.workspaces for select to authenticated
using (public.is_workspace_member(id, auth.uid()));

create policy "Authenticated create workspaces"
on public.workspaces for insert to authenticated
with check (auth.uid() = owner_id);

create policy "Admins update workspace"
on public.workspaces for update to authenticated
using (public.can_admin_workspace(id, auth.uid()));

create policy "Owner deletes workspace"
on public.workspaces for delete to authenticated
using (owner_id = auth.uid());

-- =========================================================
-- WORKSPACE_USERS RLS
-- =========================================================
create policy "Members view workspace users"
on public.workspace_users for select to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "Admins manage workspace users"
on public.workspace_users for insert to authenticated
with check (public.can_admin_workspace(workspace_id, auth.uid()));

create policy "Admins update workspace users"
on public.workspace_users for update to authenticated
using (public.can_admin_workspace(workspace_id, auth.uid()));

create policy "Admins delete workspace users"
on public.workspace_users for delete to authenticated
using (public.can_admin_workspace(workspace_id, auth.uid()));

-- Allow self-leave
create policy "User leaves workspace"
on public.workspace_users for delete to authenticated
using (user_id = auth.uid());

-- =========================================================
-- Trigger: when workspace created, add owner to workspace_users
-- =========================================================
create or replace function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_users (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

create trigger workspaces_after_insert
after insert on public.workspaces
for each row execute function public.handle_new_workspace();

-- =========================================================
-- CATEGORIES
-- =========================================================
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text not null default '',
  color text not null default '#6366f1',
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.categories enable row level security;
create index categories_ws_idx on public.categories(workspace_id);

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create policy "Members view categories"
on public.categories for select to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "Editors create categories"
on public.categories for insert to authenticated
with check (public.can_edit_workspace(workspace_id, auth.uid()));

create policy "Editors update categories"
on public.categories for update to authenticated
using (public.can_edit_workspace(workspace_id, auth.uid()));

create policy "Admins delete categories"
on public.categories for delete to authenticated
using (public.can_admin_workspace(workspace_id, auth.uid()));

-- =========================================================
-- POST GROUPS (linked posts across multiple platforms)
-- =========================================================
create table public.post_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  title text not null,
  publish_date timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.post_groups enable row level security;
create index post_groups_ws_idx on public.post_groups(workspace_id);

create trigger post_groups_set_updated_at
before update on public.post_groups
for each row execute function public.set_updated_at();

create policy "Members view post groups"
on public.post_groups for select to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "Editors create post groups"
on public.post_groups for insert to authenticated
with check (public.can_edit_workspace(workspace_id, auth.uid()));

create policy "Editors update post groups"
on public.post_groups for update to authenticated
using (public.can_edit_workspace(workspace_id, auth.uid()));

create policy "Admins delete post groups"
on public.post_groups for delete to authenticated
using (public.can_admin_workspace(workspace_id, auth.uid()));

-- =========================================================
-- EXTEND POSTS
-- =========================================================
alter table public.posts
  add column workspace_id uuid references public.workspaces(id) on delete cascade,
  add column category_id  uuid references public.categories(id) on delete set null,
  add column group_id     uuid references public.post_groups(id) on delete set null,
  add column sort_order   integer not null default 0,
  add column is_draft     boolean not null default false;

create index posts_ws_idx on public.posts(workspace_id);
create index posts_category_idx on public.posts(category_id);
create index posts_group_idx on public.posts(group_id);

-- =========================================================
-- POST VARIANTS (per-platform content for a linked post)
-- =========================================================
create table public.post_variants (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.post_groups(id) on delete cascade,
  social_account_id uuid references public.social_accounts(id) on delete set null,
  platform public.social_platform not null,
  content text not null default '',
  media_url text,
  status public.post_status not null default 'draft',
  publish_date timestamptz,
  published_at timestamptz,
  error_log text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.post_variants enable row level security;
create index post_variants_group_idx on public.post_variants(group_id);

create trigger post_variants_set_updated_at
before update on public.post_variants
for each row execute function public.set_updated_at();

create or replace function public.workspace_of_group(_group_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.post_groups where id = _group_id;
$$;

create policy "Members view post variants"
on public.post_variants for select to authenticated
using (public.is_workspace_member(public.workspace_of_group(group_id), auth.uid()));

create policy "Editors create post variants"
on public.post_variants for insert to authenticated
with check (public.can_edit_workspace(public.workspace_of_group(group_id), auth.uid()));

create policy "Editors update post variants"
on public.post_variants for update to authenticated
using (public.can_edit_workspace(public.workspace_of_group(group_id), auth.uid()));

create policy "Admins delete post variants"
on public.post_variants for delete to authenticated
using (public.can_admin_workspace(public.workspace_of_group(group_id), auth.uid()));

-- =========================================================
-- DATA MIGRATION: personal workspace per existing post author
-- =========================================================
do $$
declare
  rec record;
  ws_id uuid;
begin
  for rec in
    select distinct p.author_id, pr.display_name
    from public.posts p
    left join public.profiles pr on pr.id = p.author_id
    where p.workspace_id is null
  loop
    insert into public.workspaces (name, description, owner_id)
    values (
      coalesce('Личное пространство — ' || nullif(rec.display_name,''), 'Личное пространство'),
      'Создано автоматически при миграции',
      rec.author_id
    )
    returning id into ws_id;

    update public.posts
    set workspace_id = ws_id
    where author_id = rec.author_id and workspace_id is null;
  end loop;

  -- Also create a personal workspace for any user who has a profile but no posts
  for rec in
    select pr.id as author_id, pr.display_name
    from public.profiles pr
    where not exists (
      select 1 from public.workspace_users wu where wu.user_id = pr.id
    )
  loop
    insert into public.workspaces (name, description, owner_id)
    values (
      coalesce('Личное пространство — ' || nullif(rec.display_name,''), 'Личное пространство'),
      'Создано автоматически',
      rec.author_id
    );
  end loop;
end $$;

alter table public.posts
  alter column workspace_id set not null;

-- =========================================================
-- Auto-create personal workspace for new users
-- =========================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display text;
begin
  display := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1));

  insert into public.profiles (id, display_name)
  values (new.id, display);

  insert into public.user_roles (user_id, role)
  values (new.id, 'viewer');

  insert into public.workspaces (name, description, owner_id)
  values ('Личное пространство — ' || display, 'Создано автоматически', new.id);

  return new;
end;
$$;
