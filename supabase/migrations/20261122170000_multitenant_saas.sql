-- SmartBarrio SaaS foundation
-- Multi-tenant data model, tenant isolation and server-only integration credentials.
-- Apply only after the linked Supabase project is ACTIVE_HEALTHY.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end; $$;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  business_type text not null default 'otro' check (business_type in ('almacen','rotiseria','peluqueria','ferreteria','otro')),
  description text, phone text, whatsapp_number text, address text, city text, province text, postal_code text,
  timezone text not null default 'America/Argentina/Mendoza',
  opening_hours jsonb not null default '{}'::jsonb, logo_url text, instagram_url text, google_review_url text,
  is_published boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','editor','viewer')),
  created_at timestamptz not null default now(), unique (tenant_id, user_id)
);
create index if not exists tenant_members_user_idx on public.tenant_members(user_id, tenant_id);

create table if not exists public.products_services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null default 'product' check (kind in ('product','service')),
  name text not null check (char_length(trim(name)) between 1 and 160),
  slug text not null, description text, price numeric(12,2) check (price is null or price >= 0),
  image_url text, is_available boolean not null default true, sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);
create index if not exists products_services_public_idx on public.products_services(tenant_id, is_available, sort_order);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 100),
  description text, offer_price numeric(12,2) check (offer_price is null or offer_price >= 0),
  starts_at timestamptz not null default now(), expires_at timestamptz,
  status text not null default 'draft' check (status in ('draft','scheduled','published','expired','archived')),
  channels jsonb not null default '{"push":true,"whatsapp":false,"google":false,"instagram":false}'::jsonb,
  published_at timestamptz, created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at)
);
create index if not exists offers_public_idx on public.offers(tenant_id, status, starts_at, expires_at);

create table if not exists public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  provider text not null default 'evolution' check (provider = 'evolution'),
  instance_name text not null unique,
  connection_status text not null default 'disconnected'
    check (connection_status in ('creating','qr_pending','connecting','connected','disconnected','error')),
  phone_number text, qr_expires_at timestamptz, last_connected_at timestamptz, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_credentials (
  instance_id uuid primary key references public.whatsapp_instances(id) on delete cascade,
  api_token_ciphertext text not null,
  encryption_key_version text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscribers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  onesignal_subscription_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, onesignal_subscription_id)
);
create index if not exists push_subscribers_active_idx on public.push_subscribers(tenant_id, enabled);

create table if not exists public.social_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('instagram','google_business')),
  status text not null default 'pending' check (status in ('pending','connected','expired','error','disabled')),
  external_account_id text, account_name text, scopes text[] not null default '{}',
  token_expires_at timestamptz, last_synced_at timestamptz, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

-- OAuth credentials are isolated from the exposed public schema and encrypted server-side.
create table if not exists public.social_credentials (
  integration_id uuid primary key references public.social_integrations(id) on delete cascade,
  access_token_ciphertext text not null, refresh_token_ciphertext text,
  encryption_key_version text not null, updated_at timestamptz not null default now()
);

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  integration_id uuid references public.social_integrations(id) on delete set null,
  event_type text not null, idempotency_key text not null,
  status text not null default 'pending' check (status in ('pending','processing','succeeded','failed','dead_letter')),
  payload jsonb not null default '{}'::jsonb, result jsonb,
  attempts integer not null default 0 check (attempts >= 0), next_retry_at timestamptz,
  processed_at timestamptz, last_error text, created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);
create index if not exists integration_events_queue_idx on public.integration_events(status, next_retry_at, created_at);

create or replace function private.has_tenant_role(p_tenant_id uuid, p_roles text[])
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = p_tenant_id and tm.user_id = (select auth.uid()) and tm.role = any(p_roles)
  );
$$;

create or replace function private.create_tenant(p_name text, p_slug text, p_business_type text default 'otro')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_tenant_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 120 then
    raise exception 'Invalid business name' using errcode = '22023';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or p_slug in ('admin','api','dashboard','login','register','settings','legal') then
    raise exception 'Invalid or reserved slug' using errcode = '22023';
  end if;
  if p_business_type not in ('almacen','rotiseria','peluqueria','ferreteria','otro') then
    raise exception 'Invalid business type' using errcode = '22023';
  end if;
  insert into public.tenants(name, slug, business_type, created_by, is_published)
  values (trim(p_name), p_slug, p_business_type, v_user_id, true) returning id into v_tenant_id;
  insert into public.tenant_members(tenant_id, user_id, role) values (v_tenant_id, v_user_id, 'owner');
  return v_tenant_id;
end;
$$;

-- Public RPC wrapper: private schema stays outside the Data API exposed schemas.
create or replace function public.create_tenant(p_name text, p_slug text, p_business_type text default 'otro')
returns uuid
language sql
security invoker
set search_path = ''
as $create_tenant$
  select private.create_tenant(p_name, p_slug, p_business_type);
$create_tenant$;
revoke all on function public.create_tenant(text,text,text) from public, anon, authenticated;
grant execute on function public.create_tenant(text,text,text) to authenticated;

revoke all on function private.has_tenant_role(uuid,text[]) from public, anon, authenticated;
grant execute on function private.has_tenant_role(uuid,text[]) to anon, authenticated;
revoke all on function private.create_tenant(text,text,text) from public, anon, authenticated;
grant execute on function private.create_tenant(text,text,text) to authenticated;

do $$
declare t record;
begin
  for t in select * from (values
    ('tenants'),('products_services'),('offers'),('whatsapp_instances'),('push_subscribers'),('social_integrations')
  ) as x(table_name)
  loop
    execute format('drop trigger if exists %I on public.%I', t.table_name || '_set_updated_at', t.table_name);
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      t.table_name || '_set_updated_at', t.table_name);
  end loop;
end;
$$;

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.products_services enable row level security;
alter table public.offers enable row level security;
alter table public.whatsapp_instances enable row level security;
alter table public.whatsapp_credentials enable row level security;
revoke all on public.whatsapp_credentials from public, anon, authenticated;
alter table public.push_subscribers enable row level security;
alter table public.social_integrations enable row level security;
alter table public.integration_events enable row level security;
alter table public.social_credentials enable row level security;
revoke all on public.social_credentials from public, anon, authenticated;

create policy tenants_read_published_or_member on public.tenants for select to anon, authenticated
using (is_published or private.has_tenant_role(id, array['owner','admin','editor','viewer']));
create policy tenants_update_admin on public.tenants for update to authenticated
using (private.has_tenant_role(id, array['owner','admin']))
with check (private.has_tenant_role(id, array['owner','admin']));
create policy tenants_delete_owner on public.tenants for delete to authenticated
using (private.has_tenant_role(id, array['owner']));

create policy tenant_members_read_self on public.tenant_members for select to anon, authenticated
using (user_id = (select auth.uid()));

create policy products_services_read_public_or_member on public.products_services for select to anon, authenticated
using (
  (is_available and exists (select 1 from public.tenants t where t.id = tenant_id and t.is_published))
  or private.has_tenant_role(tenant_id, array['owner','admin','editor','viewer'])
);
create policy products_services_insert_editor on public.products_services for insert to authenticated
with check (private.has_tenant_role(tenant_id, array['owner','admin','editor']));
create policy products_services_update_editor on public.products_services for update to authenticated
using (private.has_tenant_role(tenant_id, array['owner','admin','editor']))
with check (private.has_tenant_role(tenant_id, array['owner','admin','editor']));
create policy products_services_delete_editor on public.products_services for delete to authenticated
using (private.has_tenant_role(tenant_id, array['owner','admin','editor']));

create policy offers_read_public_or_member on public.offers for select to anon, authenticated
using (
  (status = 'published' and starts_at <= now() and (expires_at is null or expires_at > now())
   and exists (select 1 from public.tenants t where t.id = tenant_id and t.is_published))
  or private.has_tenant_role(tenant_id, array['owner','admin','editor','viewer'])
);
create policy offers_insert_editor on public.offers for insert to authenticated
with check (private.has_tenant_role(tenant_id, array['owner','admin','editor']));
create policy offers_update_editor on public.offers for update to authenticated
using (private.has_tenant_role(tenant_id, array['owner','admin','editor']))
with check (private.has_tenant_role(tenant_id, array['owner','admin','editor']));
create policy offers_delete_admin on public.offers for delete to authenticated
using (private.has_tenant_role(tenant_id, array['owner','admin']));

create policy whatsapp_instances_read_member on public.whatsapp_instances for select to authenticated
using (private.has_tenant_role(tenant_id, array['owner','admin','editor','viewer']));
create policy push_subscribers_insert_public on public.push_subscribers for insert to anon, authenticated
with check (
  (user_id is null or user_id = (select auth.uid()))
  and exists (select 1 from public.tenants t where t.id = tenant_id and t.is_published)
);
create policy push_subscribers_read_admin on public.push_subscribers for select to authenticated
using (private.has_tenant_role(tenant_id, array['owner','admin']));
create policy social_integrations_read_admin on public.social_integrations for select to authenticated
using (private.has_tenant_role(tenant_id, array['owner','admin']));
create policy integration_events_read_admin on public.integration_events for select to authenticated
using (private.has_tenant_role(tenant_id, array['owner','admin']));

grant usage on schema public to anon, authenticated;
grant select on public.tenants, public.products_services, public.offers to anon, authenticated;
grant select on public.tenant_members to anon;
grant select on public.tenant_members, public.whatsapp_instances, public.push_subscribers,
  public.social_integrations, public.integration_events to authenticated;
grant update, delete on public.tenants to authenticated;
grant insert, update, delete on public.products_services, public.offers to authenticated;
grant insert on public.push_subscribers to anon, authenticated;
grant all on public.tenants, public.tenant_members, public.products_services, public.offers,
  public.whatsapp_instances, public.push_subscribers, public.social_integrations,
  public.integration_events to service_role;
grant all on public.whatsapp_credentials to service_role;
grant all on public.social_credentials to service_role;

comment on function private.create_tenant(text,text,text) is
  'Atomically creates a tenant and its owner membership for the authenticated user.';

comment on table public.social_credentials is
  'Server-only AES-256-GCM encrypted OAuth credentials. RLS enabled; only service_role receives table grants.';
comment on table public.whatsapp_credentials is
  'Server-only AES-256-GCM encrypted Evolution instance tokens. RLS enabled; only service_role receives table grants.';

commit;
