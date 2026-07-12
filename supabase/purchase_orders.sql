-- Purchase Orders table
-- Contractors create POs for subcontractors on specific projects.
-- Sub managers can view their org's POs (read-only).

create table if not exists purchase_orders (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null,
  contractor_org_id uuid not null references organizations(id) on delete cascade,
  sub_org_id       uuid references organizations(id) on delete set null,
  title            text not null,
  amount           numeric(12, 2) not null default 0,
  status           text not null default 'draft' check (status in ('draft', 'approved', 'paid')),
  notes            text,
  created_by       uuid not null references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Trigger to keep updated_at current
create or replace function update_purchase_orders_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists purchase_orders_updated_at on purchase_orders;
create trigger purchase_orders_updated_at
  before update on purchase_orders
  for each row execute function update_purchase_orders_updated_at();

-- RLS
alter table purchase_orders enable row level security;

-- Contractors: full CRUD on their org's POs
create policy "po_contractor_select"
  on purchase_orders for select
  using (contractor_org_id = any(auth_user_org_ids()));

create policy "po_contractor_insert"
  on purchase_orders for insert
  with check (contractor_org_id = any(auth_user_org_ids()));

create policy "po_contractor_update"
  on purchase_orders for update
  using (contractor_org_id = any(auth_user_org_ids()));

create policy "po_contractor_delete"
  on purchase_orders for delete
  using (contractor_org_id = any(auth_user_org_ids()));

-- Sub managers: read-only access to POs where their sub org is the recipient
create policy "po_sub_select"
  on purchase_orders for select
  using (sub_org_id = any(auth_user_sub_org_ids()));
