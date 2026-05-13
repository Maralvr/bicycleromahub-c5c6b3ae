create or replace function public.reject_shift(_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id uuid;
begin
  select id into v_staff_id from public.staff where profile_id = auth.uid() limit 1;
  if v_staff_id is null and not has_role(auth.uid(), 'admin') then
    raise exception 'Not authorized';
  end if;

  update public.shifts
    set assigned_staff_id = null,
        status = 'unassigned'
    where id = _shift_id
      and (assigned_staff_id = v_staff_id or has_role(auth.uid(), 'admin'));

  if not found then
    raise exception 'Shift not found or not assigned to you';
  end if;
end;
$$;

revoke all on function public.reject_shift(uuid) from public;
grant execute on function public.reject_shift(uuid) to authenticated;