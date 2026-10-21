-- Automatic Free access for server-verified Supabase guests and registered users.
-- Apply AFTER 202610210001. Existing beta grants, receipts and quotas are preserved.
begin;
alter table public.scanner_access_grants
  add column if not exists recognition_limit integer check (recognition_limit is null or recognition_limit >= 0),
  add column if not exists successful_recognitions integer not null default 0 check (successful_recognitions >= 0);

-- Backfill prior positive receipts so this change never resets successful usage.
update public.scanner_access_grants g set successful_recognitions = greatest(g.successful_recognitions, (
  select count(*) from public.scanner_request_receipts r where r.user_id = g.user_id
    and r.state = 'complete' and r.response_status = 200
    and jsonb_typeof(r.response_body->'candidates') = 'array'
    and jsonb_array_length(r.response_body->'candidates') > 0
));
comment on table public.scanner_access_grants is 'Automatic Free identities plus existing optional admin beta overrides. Attempts are separate from positive provider recognitions. No client plan or metadata is trusted.';

create or replace function public.scanner_ensure_access(p_user_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  -- Only called by the service role after Auth /user verification. FK requires a real Auth user.
  insert into public.scanner_access_grants(user_id,expires_at,remaining_requests,daily_request_limit,recognition_limit)
    values(p_user_id,'infinity'::timestamptz,20,20,1)
    on conflict (user_id) do nothing;
end;
$$;
revoke all on function public.scanner_ensure_access(uuid) from public, anon, authenticated;
grant execute on function public.scanner_ensure_access(uuid) to service_role;

create or replace function public.scanner_status(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  access public.scanner_access_grants%rowtype;
  limits public.scanner_service_limits%rowtype;
  daily_count bigint;
  global_count integer;
  utc_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
begin
  select * into limits from public.scanner_service_limits where singleton;
  if not found or not limits.enabled then return jsonb_build_object('status',503,'body',jsonb_build_object('error',jsonb_build_object('code','scanner_disabled'))); end if;
  perform public.scanner_ensure_access(p_user_id);
  select * into access from public.scanner_access_grants where user_id = p_user_id;
  if not found or not access.enabled or access.expires_at <= now() then
    return jsonb_build_object('status',403,'body',jsonb_build_object('error',jsonb_build_object('code','access_required')));
  end if;
  if access.recognition_limit is not null and access.successful_recognitions >= access.recognition_limit then
    return jsonb_build_object('status',429,'body',jsonb_build_object('error',jsonb_build_object('code','trial_used')));
  end if;
  select count(*) into daily_count from public.scanner_request_receipts where user_id = p_user_id and created_at >= utc_start;
  select attempts into global_count from public.scanner_global_usage where usage_date = (utc_start at time zone 'UTC')::date;
  if access.remaining_requests <= 0 or daily_count >= access.daily_request_limit then
    return jsonb_build_object('status',429,'body',jsonb_build_object('error',jsonb_build_object('code','account_limit')));
  end if;
  if coalesce(global_count,0) >= limits.daily_request_limit then
    return jsonb_build_object('status',503,'body',jsonb_build_object('error',jsonb_build_object('code','service_limit')));
  end if;
  return jsonb_build_object('status',200,'body',jsonb_build_object('ready',true,'mode','supabase-hosted','remainingRequests',access.remaining_requests));
end;
$$;

create or replace function public.scanner_claim(p_user_id uuid, p_request_id text, p_digest text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  access public.scanner_access_grants%rowtype;
  limits public.scanner_service_limits%rowtype;
  receipt public.scanner_request_receipts%rowtype;
  daily_count bigint;
  active_count bigint;
  global_count integer;
  last_started timestamptz;
  utc_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
begin
  if p_user_id is null or p_request_id is null or p_request_id !~ '^[A-Za-z0-9_-]{8,96}$' or p_digest is null or p_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid scanner claim' using errcode = '22023';
  end if;
  -- This single global lock serializes the short reservation transaction across all isolates.
  -- No vendor or network operation runs under the database lock.
  select * into limits from public.scanner_service_limits where singleton for update;
  if not found or not limits.enabled then return jsonb_build_object('status',503,'body',jsonb_build_object('error',jsonb_build_object('code','scanner_disabled'))); end if;
  perform public.scanner_ensure_access(p_user_id);
  select * into access from public.scanner_access_grants where user_id = p_user_id for update;
  if not found or not access.enabled or access.expires_at <= now() then
    return jsonb_build_object('status',403,'body',jsonb_build_object('error',jsonb_build_object('code','access_required')));
  end if;
  select * into receipt from public.scanner_request_receipts where user_id = p_user_id and request_id = p_request_id for update;
  if found then
    if receipt.image_sha256 <> p_digest then return jsonb_build_object('status',409,'body',jsonb_build_object('error',jsonb_build_object('code','request_id_conflict'))); end if;
    if receipt.state = 'processing' and receipt.lease_until > now() then
      return jsonb_build_object('status',429,'body',jsonb_build_object('error',jsonb_build_object('code','in_progress')));
    end if;
    if receipt.state = 'processing' then
      update public.scanner_request_receipts set state = 'indeterminate', response_status = 504,
        response_body = '{"error":{"code":"previous_attempt_unknown"}}'::jsonb
        where user_id = p_user_id and request_id = p_request_id returning * into receipt;
    end if;
    return jsonb_build_object('status',receipt.response_status,'body',receipt.response_body);
  end if;
  if access.recognition_limit is not null and access.successful_recognitions >= access.recognition_limit then
    return jsonb_build_object('status',429,'body',jsonb_build_object('error',jsonb_build_object('code','trial_used')));
  end if;
  if access.remaining_requests <= 0 then return jsonb_build_object('status',429,'body',jsonb_build_object('error',jsonb_build_object('code','account_limit'))); end if;
  if exists(select 1 from public.scanner_request_receipts where user_id = p_user_id and state = 'processing' and lease_until > now()) then
    return jsonb_build_object('status',429,'body',jsonb_build_object('error',jsonb_build_object('code','busy')));
  end if;
  select max(created_at), count(*) filter (where created_at >= utc_start) into last_started,daily_count from public.scanner_request_receipts where user_id = p_user_id;
  if daily_count >= access.daily_request_limit then return jsonb_build_object('status',429,'body',jsonb_build_object('error',jsonb_build_object('code','account_limit'))); end if;
  if last_started is not null and last_started > now() - access.minimum_interval_ms * interval '1 millisecond' then
    return jsonb_build_object('status',429,'body',jsonb_build_object('error',jsonb_build_object('code','rate_limited')));
  end if;
  select count(*) into active_count from public.scanner_request_receipts where state = 'processing' and lease_until > now();
  if active_count >= limits.maximum_concurrent_requests then return jsonb_build_object('status',429,'body',jsonb_build_object('error',jsonb_build_object('code','busy'))); end if;
  insert into public.scanner_global_usage(usage_date) values ((utc_start at time zone 'UTC')::date) on conflict do nothing;
  select attempts into global_count from public.scanner_global_usage where usage_date = (utc_start at time zone 'UTC')::date for update;
  if global_count >= limits.daily_request_limit then return jsonb_build_object('status',503,'body',jsonb_build_object('error',jsonb_build_object('code','service_limit'))); end if;
  update public.scanner_global_usage set attempts = attempts + 1 where usage_date = (utc_start at time zone 'UTC')::date;
  update public.scanner_access_grants set remaining_requests = remaining_requests - 1 where user_id = p_user_id;
  insert into public.scanner_request_receipts(user_id,request_id,image_sha256) values (p_user_id,p_request_id,p_digest) returning * into receipt;
  return jsonb_build_object('lease',receipt.lease_token::text);
end;
$$;

create or replace function public.scanner_complete(p_user_id uuid, p_request_id text, p_lease uuid, p_status integer, p_body jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_status not between 200 and 599 or p_status is null or p_body is null or jsonb_typeof(p_body) <> 'object'
    or octet_length(p_body::text) > 131072 or not ((p_status = 200 and p_body ? 'candidates' and jsonb_typeof(p_body->'candidates') = 'array' and jsonb_array_length(p_body->'candidates') <= 12)
      or (p_status >= 400 and p_body ? 'error')) then
    raise exception 'Invalid scanner result' using errcode = '22023';
  end if;
  perform 1 from public.scanner_service_limits where singleton for update;
  perform 1 from public.scanner_access_grants where user_id = p_user_id for update;
  update public.scanner_request_receipts set state = 'complete', response_status = p_status, response_body = p_body
    where user_id = p_user_id and request_id = p_request_id and lease_token = p_lease and state = 'processing' and lease_until > now();
  if not found then
    if exists(select 1 from public.scanner_request_receipts where user_id = p_user_id and request_id = p_request_id and lease_token = p_lease and state = 'complete' and response_status = p_status and response_body = p_body) then
      return '{"saved":true}'::jsonb;
    end if;
    raise exception 'Scanner receipt is not writable' using errcode = '55000';
  end if;
  if p_status = 200 and jsonb_array_length(p_body->'candidates') > 0 then
    update public.scanner_access_grants set successful_recognitions = successful_recognitions + 1 where user_id = p_user_id;
  end if;
  return '{"saved":true}'::jsonb;
end;
$$;

commit;
