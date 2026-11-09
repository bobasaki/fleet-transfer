-- ============================================================
-- Slice 1: initial schema — DATA_CONTRACT.md §2 + §3
-- Spike-only RLS policies labelled "spike_anon_*" for easy
-- removal when auth is added in a later slice.
-- ============================================================

-- --------------------------------------------------------
-- Storage bucket (private)
-- --------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('transfer-photos', 'transfer-photos', false)
on conflict (id) do nothing;

-- Spike: anon may upload. Replace with authenticated policy in Slice 4+.
create policy "spike_anon_upload"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'transfer-photos');

-- --------------------------------------------------------
-- transfers — one row per submitted form
-- --------------------------------------------------------
create table transfers (
  id                    uuid primary key default gen_random_uuid(),
  driver_id             text not null,
  transfer_date         date not null,
  plate_hr              text not null,
  plate_rotation        text,
  odometer_km           integer not null,
  petrol_card           text,
  visa_card             text,
  enc_device            text,
  total_cestarina_eur   numeric(10,2) not null default 0,
  total_gorivo_eur      numeric(10,2) not null default 0,
  total_ostalo_eur      numeric(10,2) not null default 0,
  dnevnica_location     text,
  dnevnica_amount_eur   numeric(10,2),
  payout_method         text,
  status                text not null default 'draft'
                          check (status in ('draft', 'submitted')),
  sheet_synced_at       timestamptz,
  retention_until       date,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at
  before update on transfers
  for each row execute function update_updated_at();

alter table transfers enable row level security;

create policy "spike_anon_insert"
  on transfers for insert to anon
  with check (true);

-- --------------------------------------------------------
-- receipts — many per transfer
-- --------------------------------------------------------
create table receipts (
  id              uuid primary key default gen_random_uuid(),
  transfer_id     uuid not null references transfers(id) on delete cascade,
  category        text not null
                    check (category in ('cestarina', 'gorivo', 'ostalo')),
  native_amount   numeric(10,2) not null,
  native_currency text not null,
  eur_amount      numeric(10,2) not null,
  fx_rate         numeric(12,6),
  fx_rate_date    date,
  receipt_date    date,
  vendor          text,
  photo_path      text not null,
  confidence      jsonb,
  raw_text        text,
  model           text,
  confirmed       boolean not null default false,
  created_at      timestamptz not null default now()
);

alter table receipts enable row level security;

create policy "spike_anon_insert"
  on receipts for insert to anon
  with check (true);

-- --------------------------------------------------------
-- transfer_photos — vehicle + odometer images
-- --------------------------------------------------------
create table transfer_photos (
  id            uuid primary key default gen_random_uuid(),
  transfer_id   uuid not null references transfers(id) on delete cascade,
  type          text not null
                  check (type in ('vehicle_hr', 'vehicle_rotation', 'odometer')),
  photo_path    text not null,
  extraction    jsonb,
  created_at    timestamptz not null default now()
);

alter table transfer_photos enable row level security;

create policy "spike_anon_insert"
  on transfer_photos for insert to anon
  with check (true);
