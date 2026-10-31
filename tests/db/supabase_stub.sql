-- Minimal stand-in for the Supabase-managed schemas, so migrations and
-- tests/db/*.test.sql can run against a plain Postgres (CI and local).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_admin;
create role authenticator;

create schema auth;
create schema storage;
create schema extensions;
create extension if not exists pgcrypto;
create publication supabase_realtime;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb,
  raw_app_meta_data jsonb,
  created_at timestamptz default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select current_setting('request.jwt.claim.role', true)
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create table storage.buckets (
  id text primary key,
  name text,
  public boolean,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
-- Supabase blocks direct SQL deletes on storage tables; deletes go through the Storage API.
create function storage.protect_delete() returns trigger language plpgsql as $$
begin
  raise exception 'Direct deletion from storage tables is not allowed' using errcode = '42501';
end;
$$;
create trigger protect_objects_delete before delete on storage.objects
  for each statement execute function storage.protect_delete();
