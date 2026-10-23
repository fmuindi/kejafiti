-- Spreadsheet import of units and tenancies for one property.
--
-- One call checks every row (p_commit = false) or imports them all (p_commit = true). Rows go
-- through the same rules as the forms: each new tenancy is created by public.create_tenancy,
-- so permission checks, opening balances and the one-tenancy-per-unit rule all apply. The
-- import is all or nothing: if any row fails, nothing is kept and every failing row is
-- reported with its row number. A dry run does the same work and then undoes it, so it
-- catches exactly what a real import would.
--
-- Rows (already parsed by the app): {row, label, layout?, bedrooms?, default_rent?,
-- tenant_name?, tenant_phone?, tenant_email?, start_date?, rent_amount?, due_day?,
-- deposit_held?, opening_balance?, opening_balance_note?}. A row without a tenant name only
-- adds the unit (or leaves an existing unit as it is).
--
-- Rollback: drop function public.import_units(uuid, jsonb, boolean), app.import_units_apply(uuid, jsonb).

create or replace function app.import_units_apply(p_property uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_property public.properties;
  r jsonb;
  v_row int;
  v_unit uuid;
  v_label text;
  v_layout text;
  v_errors jsonb := '[]'::jsonb;
  v_units int := 0;
  v_tenancies int := 0;
  v_seen text[] := '{}';
  v_msg text;
begin
  select * into v_property from public.properties where id = p_property;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_row := coalesce((r ->> 'row')::int, 0);
    v_label := trim(coalesce(r ->> 'label', ''));
    begin
      if v_label = '' then perform app.raise_error('validation', 'Enter the unit reference.'); end if;
      if lower(v_label) = any (v_seen) then perform app.raise_error('validation', 'Unit ' || v_label || ' appears more than once in the file.'); end if;
      v_seen := v_seen || lower(v_label);
      select id into v_unit from public.units where property_id = p_property and lower(label) = lower(v_label);
      if v_unit is null then
        v_layout := coalesce(nullif(r ->> 'layout', ''), 'bedsitter_studio');
        insert into public.units (org_id, property_id, label, layout, bedrooms, default_rent)
        values (v_property.org_id, p_property, v_label, v_layout,
          case when v_layout = 'bedroom_home' then coalesce(nullif(r ->> 'bedrooms', '')::int, 1)
               when v_layout = 'bedsitter_studio' then 0 end,
          coalesce(nullif(r ->> 'default_rent', '')::numeric, nullif(r ->> 'rent_amount', '')::numeric))
        returning id into v_unit;
        v_units := v_units + 1;
      end if;
      if nullif(trim(coalesce(r ->> 'tenant_name', '')), '') is not null then
        perform public.create_tenancy(jsonb_strip_nulls(jsonb_build_object(
          'unit_id', v_unit, 'tenant_name', r ->> 'tenant_name', 'tenant_phone', r ->> 'tenant_phone',
          'tenant_email', r ->> 'tenant_email', 'start_date', r ->> 'start_date', 'rent_amount', r ->> 'rent_amount',
          'due_day', r ->> 'due_day', 'deposit_held', r ->> 'deposit_held', 'opening_balance', r ->> 'opening_balance',
          'opening_balance_note', r ->> 'opening_balance_note')));
        v_tenancies := v_tenancies + 1;
      end if;
    exception
      when sqlstate 'P0001' then
        v_errors := v_errors || jsonb_build_object('row', v_row, 'message', sqlerrm);
      when check_violation or invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow
           or invalid_datetime_format then
        v_errors := v_errors || jsonb_build_object('row', v_row, 'message', 'A value in this row isn''t allowed. Check the unit type, numbers and dates.');
    end;
  end loop;
  return jsonb_build_object('errors', v_errors, 'units_created', v_units, 'tenancies_created', v_tenancies, 'rows', jsonb_array_length(p_rows));
end $$;

create or replace function public.import_units(p_property uuid, p_rows jsonb, p_commit boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform app.require(p_property, 'manage_tenancies');
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    perform app.raise_error('validation', 'The file has no rows to import.');
  end if;
  if jsonb_array_length(p_rows) > 500 then
    perform app.raise_error('validation', 'Import up to 500 rows at a time. Split the file and import it in parts.');
  end if;
  begin
    v_result := app.import_units_apply(p_property, p_rows);
    if not p_commit or jsonb_array_length(v_result -> 'errors') > 0 then
      -- Undo everything this block did, and hand the result out through the exception.
      raise exception using errcode = 'KF001', message = v_result::text;
    end if;
  exception when sqlstate 'KF001' then
    return sqlerrm::jsonb || jsonb_build_object('committed', false);
  end;
  perform app.audit((select org_id from public.properties where id = p_property), p_property, 'units_imported',
    'property', p_property::text, v_result - 'errors');
  return v_result || jsonb_build_object('committed', true);
end $$;

revoke execute on function public.import_units(uuid, jsonb, boolean) from public, anon;
grant execute on function public.import_units(uuid, jsonb, boolean) to authenticated;
