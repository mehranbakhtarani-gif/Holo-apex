-- ============================================================================
-- Holoo Corporate Apex 9.6 — Supabase PostgreSQL Dual-Cloud Sync Schema
-- Run this script once in your Supabase Dashboard -> SQL Editor.
-- Works alongside Firebase Firestore for Dual-Cloud Redundancy & Audit Trails.
-- ============================================================================

create table if not exists public.holoo_apex_workspaces (
  owner_id text primary key,
  owner_email text,
  company_name text not null default '',
  fiscal_year text not null default '1405',
  revision bigint not null default 1,
  conflict_policy text not null default 'last_write_wins'
    check (conflict_policy in ('last_write_wins', 'first_write_wins')),
  last_device_id text not null default '',
  last_device_label text not null default '',
  voucher_count integer not null default 0,
  invoice_count integer not null default 0,
  product_count integer not null default 0,
  snapshot_json jsonb not null,
  client_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.holoo_apex_audit_log (
  id bigserial primary key,
  owner_id text not null,
  device_id text not null default '',
  device_label text not null default '',
  action text not null,
  conflict_policy text not null default 'last_write_wins',
  client_revision bigint not null default 0,
  server_revision bigint not null default 0,
  outcome text not null,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists idx_holoo_apex_audit_owner_time
  on public.holoo_apex_audit_log (owner_id, created_at desc);

-- Enable Row Level Security (server accesses via service_role after verifying Firebase ID token;
-- public anon access is completely denied by default).
alter table public.holoo_apex_workspaces enable row level security;
alter table public.holoo_apex_audit_log enable row level security;

-- Rolling Cloud Backup Retention (Max 3 Versions):
-- The server automatically stores versioned backup rows in public.holoo_apex_workspaces
-- with owner_id = '<firebase_uid>__bak__<timestamp>_<revision>' and automatically deletes
-- any older rows beyond the latest 3 per user to optimize storage and cost. No extra SQL migration needed.
