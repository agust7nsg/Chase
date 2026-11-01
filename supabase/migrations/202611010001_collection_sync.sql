begin;
create table if not exists public.collection_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null check (card_id ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$'),
  quantity integer not null check (quantity between 0 and 1000000),
  added_at timestamptz not null,
  card_snapshot jsonb,
  revision bigint not null check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id,card_id)
);
create table if not exists public.collection_operation_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,operation_id)
);
alter table public.collection_items enable row level security;
alter table public.collection_operation_receipts enable row level security;
revoke all on public.collection_items, public.collection_operation_receipts from public,anon,authenticated;
grant select on public.collection_items to authenticated;
drop policy if exists collection_owner_read on public.collection_items;
create policy collection_owner_read on public.collection_items for select to authenticated
  using (user_id = (select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous'),'false') = 'false');

create or replace function public.collection_apply(p_owner uuid,p_operation uuid,p_card_id text,p_base_revision bigint,p_item jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_row public.collection_items%rowtype;
  previous public.collection_operation_receipts%rowtype;
  payload jsonb;
  answer jsonb;
  row_json jsonb;
  amount integer;
  item_date timestamptz;
  snapshot jsonb;
begin
  if auth.uid() is null or auth.uid() <> p_owner or not exists (
    select 1 from auth.users where id=p_owner and not coalesce(is_anonymous,false)
  ) then raise exception 'Collection owner authentication required' using errcode='42501'; end if;
  if p_operation is null or p_card_id is null or p_card_id !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$'
    or p_base_revision is null or p_base_revision < 0 then raise exception 'Invalid collection change' using errcode='22023'; end if;
  if p_item is not null and p_item <> 'null'::jsonb then
    if jsonb_typeof(p_item) <> 'object' or (p_item->>'cardId') is distinct from p_card_id
      or coalesce(p_item->>'quantity','') !~ '^[1-9][0-9]{0,6}$'
      or octet_length(p_item::text)>16384 then raise exception 'Invalid collection item' using errcode='22023'; end if;
    amount := (p_item->>'quantity')::integer;
    if amount > 1000000 then raise exception 'Quantity too large' using errcode='22023'; end if;
    item_date := (p_item->>'addedAt')::timestamptz;
    if item_date is null or not isfinite(item_date) then raise exception 'Invalid collection date' using errcode='22023'; end if;
    snapshot := p_item->'card';
    if p_card_id like 'tcgdex:%' and (snapshot is null or jsonb_typeof(snapshot)<>'object'
      or (snapshot->>'id') is distinct from p_card_id
      or (snapshot->'catalogIdentity'->>'provider') is distinct from 'tcgdex'
      or (snapshot->'catalogIdentity'->>'language') is null
      or (snapshot->'catalogIdentity'->>'id') is null or (snapshot->'catalogIdentity'->>'variant') is null
      or p_card_id <> 'tcgdex:'||(snapshot->'catalogIdentity'->>'language')||':'||(snapshot->'catalogIdentity'->>'id')||':'||(snapshot->'catalogIdentity'->>'variant')) then
      raise exception 'Printing snapshot required' using errcode='22023';
    end if;
  else amount := 0; item_date := now(); snapshot := null; end if;
  payload := jsonb_build_object('cardId',p_card_id,'baseRevision',p_base_revision,'item',p_item);
  -- One account lock serializes writers across server instances, including inserts.
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,9182));
  select * into previous from public.collection_operation_receipts where user_id=p_owner and operation_id=p_operation;
  if found then
    if previous.payload <> payload then raise exception 'Operation ID already used' using errcode='22023'; end if;
    return previous.result;
  end if;
  select * into current_row from public.collection_items where user_id=p_owner and card_id=p_card_id for update;
  if coalesce(current_row.revision,0) <> p_base_revision then
    row_json := jsonb_build_object('cardId',p_card_id,'revision',coalesce(current_row.revision,0),'item',case when current_row.quantity>0 then
      jsonb_strip_nulls(jsonb_build_object('cardId',p_card_id,'quantity',current_row.quantity,'addedAt',current_row.added_at,'card',current_row.card_snapshot)) else 'null'::jsonb end);
    answer := jsonb_build_object('status','conflict','row',row_json);
  else
    insert into public.collection_items(user_id,card_id,quantity,added_at,card_snapshot,revision)
      values(p_owner,p_card_id,amount,item_date,snapshot,p_base_revision+1)
      on conflict(user_id,card_id) do update set quantity=excluded.quantity,added_at=excluded.added_at,
        card_snapshot=excluded.card_snapshot,revision=excluded.revision,updated_at=now()
      returning * into current_row;
    row_json := jsonb_build_object('cardId',p_card_id,'revision',current_row.revision,'item',case when amount>0 then
      jsonb_strip_nulls(jsonb_build_object('cardId',p_card_id,'quantity',amount,'addedAt',current_row.added_at,'card',snapshot)) else 'null'::jsonb end);
    answer := jsonb_build_object('status','ok','row',row_json);
  end if;
  insert into public.collection_operation_receipts(user_id,operation_id,payload,result) values(p_owner,p_operation,payload,answer);
  return answer;
end;
$$;
revoke all on function public.collection_apply(uuid,uuid,text,bigint,jsonb) from public,anon;
grant execute on function public.collection_apply(uuid,uuid,text,bigint,jsonb) to authenticated;
commit;
