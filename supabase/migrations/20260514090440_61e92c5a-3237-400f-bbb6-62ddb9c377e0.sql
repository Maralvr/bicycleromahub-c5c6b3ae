alter table public.shifts
  add column if not exists channel_booking_ref text,
  add column if not exists external_booking_ref text,
  add column if not exists customer_email text,
  add column if not exists seller text,
  add column if not exists booking_channel text,
  add column if not exists rate_title text,
  add column if not exists participants jsonb not null default '[]'::jsonb,
  add column if not exists operations_notes text,
  add column if not exists bokun_created_at timestamptz,
  add column if not exists ticket_sent boolean not null default false;