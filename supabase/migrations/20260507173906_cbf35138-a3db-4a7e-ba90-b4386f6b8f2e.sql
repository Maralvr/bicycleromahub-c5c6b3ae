
-- =========================================================================
-- ENUMS
-- =========================================================================
create type public.app_role as enum ('admin', 'staff');
create type public.shift_source as enum ('manual', 'bokun');
create type public.shift_status as enum ('unassigned', 'pending', 'accepted', 'rejected');
create type public.staff_role as enum ('guide', 'rental', 'mechanic', 'admin');
create type public.staff_status as enum ('available', 'on_shift', 'off');
create type public.task_priority as enum ('low', 'medium', 'high');
create type public.note_category as enum ('general', 'bike_issue', 'customer', 'incident');
create type public.field_update_type as enum ('field', 'progress', 'completed', 'blocker');
create type public.task_update_type as enum ('progress', 'completed', 'blocker');
create type public.notification_type as enum (
  'assigned','reassigned','unassigned','shift_updated','shift_cancelled',
  'broadcast','reminder','task'
);

-- =========================================================================
-- HELPER: updated_at trigger
-- =========================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- =========================================================================
-- RENTAL POINTS
-- =========================================================================
create table public.rental_points (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  phone text,
  opening_hours text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger rental_points_updated_at before update on public.rental_points
  for each row execute function public.set_updated_at();

-- =========================================================================
-- STAFF (directory; one row per staff member)
-- =========================================================================
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique,
  name text not null,
  avatar text not null default '',
  role public.staff_role not null default 'guide',
  status public.staff_status not null default 'available',
  phone text,
  email text,
  tags text[] not null default '{}',
  languages text[] not null default '{}',
  licenses text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger staff_updated_at before update on public.staff
  for each row execute function public.set_updated_at();

-- =========================================================================
-- PROFILES (mirrors auth.users; never FKs to auth.users by spec)
-- =========================================================================
create table public.profiles (
  id uuid primary key,
  display_name text not null default '',
  avatar_initials text not null default '',
  phone text,
  staff_id uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- =========================================================================
-- USER ROLES (separate table per security best practice)
-- =========================================================================
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- =========================================================================
-- STAFF <-> RENTAL POINTS
-- =========================================================================
create table public.staff_rental_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  rental_point_id uuid not null references public.rental_points(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, rental_point_id)
);

-- =========================================================================
-- SHIFTS
-- =========================================================================
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  source public.shift_source not null default 'manual',
  booking_id text,
  tour_name text not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  meeting_point text not null default '',
  rental_point_id uuid references public.rental_points(id) on delete set null,
  customer_name text,
  customer_phone text,
  adults int not null default 0,
  teens int not null default 0,
  infants int not null default 0,
  trailers int not null default 0,
  rate numeric(10,2),
  notes text,
  required_tags text[] not null default '{}',
  assigned_staff_id uuid references public.staff(id) on delete set null,
  status public.shift_status not null default 'unassigned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger shifts_updated_at before update on public.shifts
  for each row execute function public.set_updated_at();
create index shifts_date_idx on public.shifts(date);
create index shifts_assigned_staff_id_idx on public.shifts(assigned_staff_id);
create index shifts_rental_point_id_idx on public.shifts(rental_point_id);

-- =========================================================================
-- STAFF UNAVAILABILITY
-- =========================================================================
create table public.staff_unavailability (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  date date not null,
  all_day boolean not null default true,
  from_time time,
  to_time time,
  reason text,
  created_at timestamptz not null default now()
);
create index staff_unavailability_staff_date_idx on public.staff_unavailability(staff_id, date);

-- =========================================================================
-- TASKS
-- =========================================================================
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assigned_to uuid not null,
  due date not null,
  priority public.task_priority not null default 'medium',
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- =========================================================================
-- TASK UPDATES
-- =========================================================================
create table public.task_updates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_staff_id uuid not null references public.staff(id) on delete cascade,
  message text not null,
  type public.task_update_type not null default 'progress',
  attachments jsonb not null default '[]'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- GUIDE NOTES (per shift)
-- =========================================================================
create table public.guide_notes (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  author_staff_id uuid not null references public.staff(id) on delete cascade,
  message text not null,
  category public.note_category not null default 'general',
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- FIELD UPDATES (global feed)
-- =========================================================================
create table public.field_updates (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null,
  message text not null,
  type public.field_update_type not null default 'field',
  time text,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- GUIDE NOTIFICATIONS (per-staff inbox)
-- =========================================================================
create table public.guide_notifications (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text not null,
  shift_id uuid references public.shifts(id) on delete set null,
  link text,
  attachments jsonb not null default '[]'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index guide_notifications_staff_id_idx on public.guide_notifications(staff_id);

-- =========================================================================
-- AUTH BOOTSTRAP: on signup, create profile + staff row + default 'staff' role
-- =========================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_staff_id uuid;
  v_display text;
  v_initials text;
begin
  v_display := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'User');
  v_initials := upper(substr(v_display, 1, 2));

  insert into public.staff (profile_id, name, avatar, role, email)
  values (new.id, v_display, v_initials, 'guide', new.email)
  returning id into v_staff_id;

  insert into public.profiles (id, display_name, avatar_initials, staff_id)
  values (new.id, v_display, v_initials, v_staff_id);

  insert into public.user_roles (user_id, role)
  values (new.id, 'staff');

  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================
alter table public.rental_points          enable row level security;
alter table public.staff                  enable row level security;
alter table public.profiles               enable row level security;
alter table public.user_roles             enable row level security;
alter table public.staff_rental_points    enable row level security;
alter table public.shifts                 enable row level security;
alter table public.staff_unavailability   enable row level security;
alter table public.tasks                  enable row level security;
alter table public.task_updates           enable row level security;
alter table public.guide_notes            enable row level security;
alter table public.field_updates          enable row level security;
alter table public.guide_notifications    enable row level security;

-- rental_points
create policy rp_select on public.rental_points for select to authenticated using (true);
create policy rp_admin_write on public.rental_points for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- staff (everyone authenticated reads; admins write; users update their own row)
create policy staff_select on public.staff for select to authenticated using (true);
create policy staff_admin_all on public.staff for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy staff_self_update on public.staff for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- profiles
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on public.profiles for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- user_roles
create policy user_roles_self_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy user_roles_admin_all on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- staff_rental_points
create policy srp_select on public.staff_rental_points for select to authenticated using (true);
create policy srp_admin_all on public.staff_rental_points for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- shifts (all authenticated read; admins write; assigned staff can update status)
create policy shifts_select on public.shifts for select to authenticated using (true);
create policy shifts_admin_all on public.shifts for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy shifts_assigned_update on public.shifts for update to authenticated
  using (
    assigned_staff_id in (select id from public.staff where profile_id = auth.uid())
  )
  with check (
    assigned_staff_id in (select id from public.staff where profile_id = auth.uid())
  );

-- staff_unavailability (read all; staff manages own; admins manage any)
create policy unavail_select on public.staff_unavailability for select to authenticated using (true);
create policy unavail_self_all on public.staff_unavailability for all to authenticated
  using (staff_id in (select id from public.staff where profile_id = auth.uid()))
  with check (staff_id in (select id from public.staff where profile_id = auth.uid()));
create policy unavail_admin_all on public.staff_unavailability for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- tasks (all read; admins write; assignee can update done flag via app)
create policy tasks_select on public.tasks for select to authenticated using (true);
create policy tasks_admin_all on public.tasks for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy tasks_assignee_update on public.tasks for update to authenticated
  using (assigned_to = auth.uid()) with check (assigned_to = auth.uid());

-- task_updates
create policy tu_select on public.task_updates for select to authenticated using (true);
create policy tu_self_insert on public.task_updates for insert to authenticated
  with check (author_staff_id in (select id from public.staff where profile_id = auth.uid()));
create policy tu_admin_all on public.task_updates for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- guide_notes
create policy gn_select on public.guide_notes for select to authenticated using (true);
create policy gn_self_insert on public.guide_notes for insert to authenticated
  with check (author_staff_id in (select id from public.staff where profile_id = auth.uid()));
create policy gn_admin_all on public.guide_notes for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- field_updates (global feed)
create policy fu_select on public.field_updates for select to authenticated using (true);
create policy fu_self_insert on public.field_updates for insert to authenticated
  with check (author_id = auth.uid() or author_id in (select id from public.staff where profile_id = auth.uid()));
create policy fu_admin_all on public.field_updates for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- guide_notifications (recipient reads/updates own; admins create/all)
create policy gnotif_select on public.guide_notifications for select to authenticated
  using (
    staff_id in (select id from public.staff where profile_id = auth.uid())
    or public.has_role(auth.uid(), 'admin')
  );
create policy gnotif_self_update on public.guide_notifications for update to authenticated
  using (staff_id in (select id from public.staff where profile_id = auth.uid()))
  with check (staff_id in (select id from public.staff where profile_id = auth.uid()));
create policy gnotif_admin_all on public.guide_notifications for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- REALTIME
-- =========================================================================
alter publication supabase_realtime add table public.shifts;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.task_updates;
alter publication supabase_realtime add table public.guide_notes;
alter publication supabase_realtime add table public.field_updates;
alter publication supabase_realtime add table public.guide_notifications;
