-- Merchantlight — items and materials can be removed. They leave every list and the catalogue,
-- receipts and crafts keep their history. The name is freed, so it can be used again.

create function merchant.remove_item(p_kind text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_used text;
begin
  perform merchant._require(merchant.is_manager(), 'removing items');
  if p_kind = 'good' then
    select name into v_name from merchant.goods where id = p_id and active for update;
    select string_agg(g.name, ', ' order by g.name) into v_used
    from merchant.recipe_components c join merchant.goods g on g.id = c.good_id
    where c.component_good_id = p_id and g.active;
  elsif p_kind = 'material' then
    select name into v_name from merchant.materials where id = p_id and active for update;
    select string_agg(g.name, ', ' order by g.name) into v_used
    from merchant.recipe_components c join merchant.goods g on g.id = c.good_id
    where c.material_id = p_id and g.active;
  end if;
  if v_name is null then raise exception 'Item not found' using errcode = 'P0001'; end if;
  if v_used is not null then
    raise exception '% is still part of: %. Take it out of those recipes first.', v_name, v_used using errcode = 'P0001';
  end if;

  if p_kind = 'good' then
    update merchant.goods set active = false, on_menu = false, name = name || ' (removed ' || left(id::text, 8) || ')' where id = p_id;
    update merchant.craft_requests set status = 'cancelled', completed_at = now() where good_id = p_id and status = 'open';
  else
    update merchant.materials set active = false, on_menu = false, name = name || ' (removed ' || left(id::text, 8) || ')' where id = p_id;
  end if;
end $$;

revoke execute on function merchant.remove_item(text, uuid) from public;
grant execute on function merchant.remove_item(text, uuid) to merchant_app;
