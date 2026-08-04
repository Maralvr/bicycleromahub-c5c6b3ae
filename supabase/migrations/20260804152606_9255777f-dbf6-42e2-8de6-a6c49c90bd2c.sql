-- Rental-assignment managers: admins plus explicitly designated users.
create or replace function public.can_manage_rental_assignments(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role(_user_id, 'admin')
    or exists (
      select 1 from auth.users u
      where u.id = _user_id
        and lower(u.email) in ('magnorobz@gmail.com')
    )
$$;

revoke all on function public.can_manage_rental_assignments(uuid) from public;
grant execute on function public.can_manage_rental_assignments(uuid) to authenticated, service_role;

-- Day assignments: full manage rights for managers (no cap on rows per day/point).
drop policy if exists rpda_manager_all on public.rental_point_day_assignments;
create policy rpda_manager_all
  on public.rental_point_day_assignments
  for all
  to authenticated
  using (public.can_manage_rental_assignments(auth.uid()))
  with check (public.can_manage_rental_assignments(auth.uid()));

-- Managers need to see staff day-off entries to spot conflicts before assigning.
drop policy if exists rsu_manager_select on public.rental_staff_unavailability;
create policy rsu_manager_select
  on public.rental_staff_unavailability
  for select
  to authenticated
  using (public.can_manage_rental_assignments(auth.uid()));

-- Managers must be able to read the roster they assign from.
drop policy if exists rstaff_manager_select on public.rental_staff;
create policy rstaff_manager_select
  on public.rental_staff
  for select
  to authenticated
  using (public.can_manage_rental_assignments(auth.uid()));