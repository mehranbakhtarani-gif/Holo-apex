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


-- Device credentials: raw bearer tokens are never stored; only SHA-256 hashes are persisted.
create table if not exists public.holoo_apex_device_tokens (
  id bigserial primary key,
  token_hash text not null unique
    check (token_hash ~ '^[a-f0-9]{64}
-- public anon access is completely denied by default).
alter table public.holoo_apex_workspaces enable row level security;
alter table public.holoo_apex_audit_log enable row level security;
alter table public.holoo_apex_device_tokens enable row level security;
alter table public.holoo_apex_pair_codes enable row level security;

-- Explicitly deny direct client access; the Worker uses the server-only service_role key.
revoke all on table public.holoo_apex_workspaces, public.holoo_apex_audit_log,
  public.holoo_apex_device_tokens, public.holoo_apex_pair_codes from anon, authenticated;
grant all on table public.holoo_apex_workspaces, public.holoo_apex_audit_log,
  public.holoo_apex_device_tokens, public.holoo_apex_pair_codes to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Rolling Cloud Backup Retention (Max 3 Versions):
-- The server automatically stores versioned backup rows in public.holoo_apex_workspaces
-- with owner_id = '<firebase_uid>__bak__<timestamp>_<revision>' and automatically deletes
-- any older rows beyond the latest 3 per user to optimize storage and cost. No extra SQL migration needed.
),
  owner_id text not null,
  device_id text not null,
  device_label text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists idx_holoo_apex_device_tokens_owner_active
  on public.holoo_apex_device_tokens (owner_id, device_id)
  where revoked_at is null;

-- Short-lived, single-use device pairing codes. Only the hash is stored.
create table if not exists public.holoo_apex_pair_codes (
  id bigserial primary key,
  code_hash text not null unique
    check (code_hash ~ '^[a-f0-9]{64}
-- public anon access is completely denied by default).
alter table public.holoo_apex_workspaces enable row level security;
alter table public.holoo_apex_audit_log enable row level security;

-- Rolling Cloud Backup Retention (Max 3 Versions):
-- The server automatically stores versioned backup rows in public.holoo_apex_workspaces
-- with owner_id = '<firebase_uid>__bak__<timestamp>_<revision>' and automatically deletes
-- any older rows beyond the latest 3 per user to optimize storage and cost. No extra SQL migration needed.
),
  owner_id text not null,
  created_by_device_id text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_holoo_apex_pair_codes_owner_expiry
  on public.holoo_apex_pair_codes (owner_id, expires_at desc);

-- Enable Row Level Security (server accesses via service_role after verifying Firebase ID token;
-- public anon access is completely denied by default).
alter table public.holoo_apex_workspaces enable row level security;
alter table public.holoo_apex_audit_log enable row level security;

-- Rolling Cloud Backup Retention (Max 3 Versions):
-- The server automatically stores versioned backup rows in public.holoo_apex_workspaces
-- with owner_id = '<firebase_uid>__bak__<timestamp>_<revision>' and automatically deletes
-- any older rows beyond the latest 3 per user to optimize storage and cost. No extra SQL migration needed.
