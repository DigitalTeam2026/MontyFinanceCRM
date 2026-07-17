/*
  # Dashboard related-filter — support REVERSE relationship hops

  `dashboard_build_related_predicate` previously only traversed FORWARD FKs
  (child → parent: the FK lives on the previous table, joined to the hop's PK).
  That can't express "parent HAS a child" — e.g. keep only the accounts that a
  lead points at (`lead.account_id` → account is a reverse link from account's
  side).

  This adds an optional per-hop `direction`:
    • 'forward' (default) — unchanged: prev.fk = hop.pk
    • 'reverse'           — hop.fk = prev.pk, i.e.
        EXISTS (SELECT 1 FROM <child> WHERE <child>.<fk> = <parent>.<pk> …)

  Everything else (soft-delete guard per hop, EXISTS nesting, the compat error
  swallowing in the callers) is unchanged. CREATE OR REPLACE preserves the
  existing grants, so none are re-issued here.
*/

CREATE OR REPLACE FUNCTION public.dashboard_build_related_predicate(p_base_table text, p_rf jsonb)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_path     jsonb := COALESCE(p_rf->'path', '[]'::jsonb);
  v_prev_tbl text := p_base_table;
  v_prev_ref text := p_base_table;
  v_tables   text[] := '{}';
  v_aliases  text[] := '{}';
  v_joins    text[] := '{}';
  v_leaf_col text;
  v_inner    text;
  v_act      text;
  v_i        int := 0;
  hop        jsonb;
  v_tbl      text;
  v_dir      text;
  v_fk       text;
  v_alias    text;
BEGIN
  IF jsonb_array_length(v_path) = 0 THEN
    RETURN NULL;   -- empty path = field on the base entity → normal filter
  END IF;

  FOR hop IN SELECT * FROM jsonb_array_elements(v_path) LOOP
    v_i     := v_i + 1;
    v_tbl   := public.dashboard_resolve_table(hop->>'entity');
    v_dir   := lower(COALESCE(hop->>'direction', 'forward'));
    v_alias := 'rf' || v_i;
    IF v_dir = 'reverse' THEN
      -- parent → child: FK lives on the CHILD (v_tbl), joined to prev's PK.
      v_fk    := public.dashboard_assert_column(v_tbl, hop->>'fk');
      v_joins := v_joins || format('%I.%I = %I.%I',
                   v_alias, v_fk, v_prev_ref, public.dashboard_pk_column(v_prev_tbl));
    ELSE
      -- child → parent: FK lives on the PREVIOUS table, joined to child's PK.
      v_fk    := public.dashboard_assert_column(v_prev_tbl, hop->>'fk');
      v_joins := v_joins || format('%I.%I = %I.%I',
                   v_alias, public.dashboard_pk_column(v_tbl), v_prev_ref, v_fk);
    END IF;
    v_tables   := v_tables  || v_tbl;
    v_aliases  := v_aliases || v_alias;
    v_prev_ref := v_alias;
    v_prev_tbl := v_tbl;
  END LOOP;

  v_leaf_col := public.dashboard_assert_column(v_prev_tbl, p_rf->>'field');
  v_inner := public.dashboard_predicate_expr(
               format('%I.%I', v_aliases[array_length(v_aliases, 1)], v_leaf_col), p_rf);

  FOR v_i IN REVERSE array_length(v_tables, 1)..1 LOOP
    v_act := public.dashboard_active_pred(v_tables[v_i], v_aliases[v_i]);
    v_inner := format('EXISTS (SELECT 1 FROM public.%I %I WHERE %s%s AND %s)',
                      v_tables[v_i], v_aliases[v_i], v_joins[v_i],
                      CASE WHEN v_act <> '' THEN ' AND ' || v_act ELSE '' END,
                      v_inner);
  END LOOP;
  RETURN v_inner;
END;
$$;
