-- Beaker Buddies cloud save.
-- One row per save, found by the SHA-256 of a secret sync code that the player copies between devices.
-- Nothing in the table is readable or writable directly: the anon key can only call the two
-- functions below, and they only touch the row whose code the caller knows.
-- Everything is prefixed bb_ so it can live in a project shared with other apps.

create table if not exists public.bb_saves (
  key_hash   text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  save       jsonb not null,
  version    bigint not null default 1,
  device_id  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bb_saves enable row level security;
-- no policies: direct access is denied to anon and authenticated
revoke all on table public.bb_saves from anon, authenticated;

create or replace function public.bb_key_hash(sync_key text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  -- 26 base32 characters = 130 random bits, generated on the device
  if sync_key is null or sync_key !~ '^[A-Z2-7]{26}$' then
    raise exception 'invalid sync code' using errcode = '22023';
  end if;
  return encode(sha256(convert_to('beaker-buddies:' || sync_key, 'UTF8')), 'hex');
end;
$$;

-- Read the save for a code. Returns {found:false} or {found:true, version, save, updated_at}.
create or replace function public.bb_get_save(sync_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.bb_saves%rowtype;
begin
  select * into r from public.bb_saves where key_hash = public.bb_key_hash(sync_key);
  if not found then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object('found', true, 'version', r.version, 'save', r.save, 'updated_at', r.updated_at);
end;
$$;

-- Write the save for a code, compare-and-swap on version so two devices cannot overwrite each other
-- blindly. base_version 0 = "I expect no row yet". Returns {ok:true, version} or
-- {ok:false, version:<current>} when someone else wrote first (the client then pulls, merges, retries).
create or replace function public.bb_put_save(sync_key text, save jsonb, base_version bigint, device_id text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  h text := public.bb_key_hash(sync_key);
  cur bigint;
begin
  if save is null or jsonb_typeof(save) <> 'object' or (save ->> 'schemaVersion') is null then
    raise exception 'not a Beaker Buddies save' using errcode = '22023';
  end if;
  if octet_length(save::text) > 2000000 then
    raise exception 'save too large' using errcode = '22023';
  end if;
  if device_id is not null and length(device_id) > 64 then
    raise exception 'device id too long' using errcode = '22023';
  end if;

  select version into cur from public.bb_saves where key_hash = h for update;
  if not found then
    if base_version <> 0 then
      return jsonb_build_object('ok', false, 'version', 0);
    end if;
    insert into public.bb_saves (key_hash, save, version, device_id) values (h, save, 1, device_id);
    return jsonb_build_object('ok', true, 'version', 1);
  end if;
  if cur <> base_version then
    return jsonb_build_object('ok', false, 'version', cur);
  end if;
  update public.bb_saves
     set save = bb_put_save.save, version = cur + 1, device_id = bb_put_save.device_id, updated_at = now()
   where key_hash = h;
  return jsonb_build_object('ok', true, 'version', cur + 1);
end;
$$;

revoke all on function public.bb_key_hash(text) from public;
revoke all on function public.bb_get_save(text) from public;
revoke all on function public.bb_put_save(text, jsonb, bigint, text) from public;
grant execute on function public.bb_get_save(text) to anon, authenticated;
grant execute on function public.bb_put_save(text, jsonb, bigint, text) to anon, authenticated;
