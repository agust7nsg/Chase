begin;
-- Independent of auth.users: a private, short-lived recovery capability remains
-- usable after deletion. No user UUID, email, token or plaintext proof is stored.
create table if not exists public.account_deletion_receipts (
  operation_id uuid primary key,
  owner_hash text not null check(owner_hash ~ '^[a-f0-9]{64}$'),
  proof_hash text not null check(proof_hash ~ '^[a-f0-9]{64}$'),
  state text not null default 'pending' check(state in ('pending','deleted')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '7 days'
);
create index if not exists account_deletion_expiry on public.account_deletion_receipts(expires_at);
alter table public.account_deletion_receipts enable row level security;
revoke all on public.account_deletion_receipts from public,anon,authenticated;
create or replace function public.account_deletion_find(p_operation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare found_receipt public.account_deletion_receipts%rowtype;
begin
 delete from public.account_deletion_receipts where expires_at<now();
 select * into found_receipt from public.account_deletion_receipts where operation_id=p_operation;
 if not found then return null; end if;
 return jsonb_build_object('owner_hash',found_receipt.owner_hash,'proof_hash',found_receipt.proof_hash,'state',found_receipt.state,'created_at',found_receipt.created_at);
end; $$;
create or replace function public.account_deletion_begin(p_operation uuid,p_owner_hash text,p_proof_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare found_receipt public.account_deletion_receipts%rowtype;
begin
 if p_operation is null or coalesce(p_owner_hash,'') !~ '^[a-f0-9]{64}$' or coalesce(p_proof_hash,'') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid deletion request'; end if;
 insert into public.account_deletion_receipts(operation_id,owner_hash,proof_hash) values(p_operation,p_owner_hash,p_proof_hash) on conflict(operation_id) do nothing;
 select * into found_receipt from public.account_deletion_receipts where operation_id=p_operation;
 if found_receipt.owner_hash<>p_owner_hash or found_receipt.proof_hash<>p_proof_hash then raise exception 'Deletion request mismatch'; end if;
 return jsonb_build_object('owner_hash',found_receipt.owner_hash,'proof_hash',found_receipt.proof_hash,'state',found_receipt.state,'created_at',found_receipt.created_at);
end; $$;
create or replace function public.account_deletion_complete(p_operation uuid,p_owner_hash text,p_proof_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 update public.account_deletion_receipts set state='deleted' where operation_id=p_operation and owner_hash=p_owner_hash and proof_hash=p_proof_hash and expires_at>now();
 if not found then raise exception 'Deletion receipt unavailable'; end if;
 return jsonb_build_object('saved',true);
end; $$;
revoke all on function public.account_deletion_find(uuid),public.account_deletion_begin(uuid,text,text),public.account_deletion_complete(uuid,text,text) from public,anon,authenticated;
grant execute on function public.account_deletion_find(uuid),public.account_deletion_begin(uuid,text,text),public.account_deletion_complete(uuid,text,text) to service_role;
commit;
