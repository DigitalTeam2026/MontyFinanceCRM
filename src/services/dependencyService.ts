import { supabase } from '../lib/supabase';

export interface Dependency {
  type: 'view' | 'form' | 'business_rule' | 'process_flow' | 'workflow' | 'relationship' | 'column_security' | 'navigation' | 'security_role';
  name: string;
  location: string;
  reason: string;
  /** ID of the dependent record (form_id, view_id, rule_id, flow_id, etc.) */
  recordId?: string;
  /** Sub-type to differentiate view column vs view filter vs view sort */
  subType?: 'column' | 'filter' | 'sort';
}

export interface DependencyResult {
  canDelete: boolean;
  dependencies: Dependency[];
}

/** Remove a field control from a form layout_json and save */
export async function removeFieldFromForm(
  formId: string,
  fieldDefinitionId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('form_definition')
    .select('layout_json')
    .eq('form_id', formId)
    .single();
  if (error) throw error;

  const layout = data.layout_json as { tabs?: unknown[] } | null;
  if (!layout) return;

  const tabs = (layout as { tabs?: unknown[] }).tabs ?? [];
  for (const tab of tabs as { sections?: unknown[] }[]) {
    for (const sec of (tab.sections ?? []) as { controls?: unknown[] }[]) {
      sec.controls = ((sec.controls ?? []) as { field_definition_id?: string }[])
        .filter((c) => c.field_definition_id !== fieldDefinitionId);
    }
  }

  const { error: saveErr } = await supabase
    .from('form_definition')
    .update({ layout_json: layout, modified_at: new Date().toISOString() })
    .eq('form_id', formId);
  if (saveErr) throw saveErr;
}

/** Remove a field from a view column list and save */
export async function removeFieldFromViewColumn(
  viewId: string,
  fieldDefinitionId: string,
): Promise<void> {
  const { error } = await supabase
    .from('view_column')
    .delete()
    .eq('view_id', viewId)
    .eq('field_definition_id', fieldDefinitionId);
  if (error) throw error;
}

/** Remove a field from view filter_json and save */
export async function removeFieldFromViewFilter(
  viewId: string,
  fieldLogicalName: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('view_definition')
    .select('filter_json')
    .eq('view_id', viewId)
    .single();
  if (error) throw error;

  const filter = data.filter_json as { conditions?: { field_logical_name?: string }[] } | null;
  if (!filter) return;
  filter.conditions = (filter.conditions ?? []).filter((c) => c.field_logical_name !== fieldLogicalName);

  const { error: saveErr } = await supabase
    .from('view_definition')
    .update({ filter_json: filter.conditions?.length ? filter : null, modified_at: new Date().toISOString() })
    .eq('view_id', viewId);
  if (saveErr) throw saveErr;
}

/** Remove a field from view sort_json and save */
export async function removeFieldFromViewSort(
  viewId: string,
  fieldLogicalName: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('view_definition')
    .select('sort_json')
    .eq('view_id', viewId)
    .single();
  if (error) throw error;

  const sort = (data.sort_json as { field_logical_name?: string }[] | null) ?? [];
  const updated = sort.filter((s) => s.field_logical_name !== fieldLogicalName);

  const { error: saveErr } = await supabase
    .from('view_definition')
    .update({ sort_json: updated, modified_at: new Date().toISOString() })
    .eq('view_id', viewId);
  if (saveErr) throw saveErr;
}

/* ─── Column dependency check ─── */
export async function checkColumnDependencies(
  entityDefinitionId: string,
  fieldDefinitionId: string,
  fieldLogicalName: string,
  entityLogicalName: string,
): Promise<DependencyResult> {
  const deps: Dependency[] = [];

  await Promise.all([
    checkColumnInViews(entityDefinitionId, fieldDefinitionId, fieldLogicalName, deps),
    checkColumnInForms(entityDefinitionId, fieldDefinitionId, deps),
    checkColumnInBusinessRules(entityDefinitionId, fieldLogicalName, deps),
    checkColumnInProcessFlows(entityDefinitionId, fieldLogicalName, deps),
    checkColumnInWorkflows(entityDefinitionId, fieldLogicalName, deps),
    checkColumnInColumnSecurity(entityLogicalName, fieldLogicalName, deps),
  ]);

  return { canDelete: deps.length === 0, dependencies: deps };
}

async function checkColumnInViews(
  entityDefinitionId: string,
  fieldDefinitionId: string,
  fieldLogicalName: string,
  deps: Dependency[],
) {
  // 1a. view_column references
  const { data: colRows } = await supabase
    .from('view_column')
    .select('view_id, view_definition(name)')
    .eq('field_definition_id', fieldDefinitionId);

  for (const row of colRows ?? []) {
    const vd = row.view_definition as unknown as { name: string; view_id?: string } | null;
    deps.push({
      type: 'view',
      name: vd?.name ?? 'Unknown View',
      location: 'Displayed column',
      reason: 'Field is used as a visible column in this view',
      recordId: row.view_id as string,
      subType: 'column',
    });
  }

  // 1b. filter_json / sort_json in view_definition
  const { data: viewRows } = await supabase
    .from('view_definition')
    .select('view_id, name, filter_json, sort_json')
    .eq('entity_definition_id', entityDefinitionId)
    .is('deleted_at', null);

  for (const view of viewRows ?? []) {
    const filterJson = view.filter_json as { conditions?: { field_logical_name?: string }[] } | null;
    const sortJson = view.sort_json as { field_logical_name?: string }[] | null;

    const inFilter = filterJson?.conditions?.some((c) => c.field_logical_name === fieldLogicalName);
    const inSort = sortJson?.some((s) => s.field_logical_name === fieldLogicalName);

    if (inFilter) {
      deps.push({
        type: 'view',
        name: view.name,
        location: 'Filter condition',
        reason: `Field "${fieldLogicalName}" is used in a filter condition`,
        recordId: view.view_id,
        subType: 'filter',
      });
    }
    if (inSort) {
      deps.push({
        type: 'view',
        name: view.name,
        location: 'Sort order',
        reason: `Field "${fieldLogicalName}" is used in a sort definition`,
        recordId: view.view_id,
        subType: 'sort',
      });
    }
  }
}

async function checkColumnInForms(
  entityDefinitionId: string,
  fieldDefinitionId: string,
  deps: Dependency[],
) {
  const { data: forms } = await supabase
    .from('form_definition')
    .select('form_id, name, form_type, layout_json')
    .eq('entity_definition_id', entityDefinitionId)
    .is('deleted_at', null);

  for (const form of forms ?? []) {
    const layout = form.layout_json as { tabs?: unknown[] } | unknown[] | null;
    if (!layout) continue;
    const tabs = Array.isArray(layout) ? layout : (layout as { tabs?: unknown[] }).tabs ?? [];
    for (const tab of tabs as { label?: string; sections?: unknown[] }[]) {
      for (const sec of (tab.sections ?? []) as { label?: string; controls?: unknown[] }[]) {
        for (const ctrl of (sec.controls ?? []) as { field_definition_id?: string }[]) {
          if (ctrl.field_definition_id === fieldDefinitionId) {
            deps.push({
              type: 'form',
              name: form.name,
              location: `${tab.label ?? 'Tab'} → ${sec.label ?? 'Section'}`,
              reason: 'Field is placed in this form section',
              recordId: form.form_id,
            });
          }
        }
      }
    }
  }
}

async function checkColumnInBusinessRules(
  entityDefinitionId: string,
  fieldLogicalName: string,
  deps: Dependency[],
) {
  const { data: rules } = await supabase
    .from('business_rule')
    .select('business_rule_id, name, trigger_json, action_json')
    .eq('entity_definition_id', entityDefinitionId)
    .is('deleted_at', null);

  for (const rule of rules ?? []) {
    const triggerJson = rule.trigger_json as { watch_fields?: string[] } | null;
    const actionJson = rule.action_json as unknown;
    const actionStr = JSON.stringify(actionJson ?? '');
    const inTrigger = triggerJson?.watch_fields?.includes(fieldLogicalName);
    const inAction = actionStr.includes(fieldLogicalName);

    if (inTrigger) {
      deps.push({
        type: 'business_rule',
        name: rule.name,
        location: 'Trigger condition (watched fields)',
        reason: `Field "${fieldLogicalName}" is watched in the rule trigger`,
        recordId: rule.business_rule_id,
      });
    } else if (inAction) {
      deps.push({
        type: 'business_rule',
        name: rule.name,
        location: 'Rule action',
        reason: `Field "${fieldLogicalName}" is referenced in the rule actions`,
        recordId: rule.business_rule_id,
      });
    }
  }
}

async function checkColumnInProcessFlows(
  entityDefinitionId: string,
  fieldLogicalName: string,
  deps: Dependency[],
) {
  // Restrict to this entity's flows. process_stage_fields and
  // process_flow_transition both carry a direct process_flow_id, so we resolve
  // names from this map instead of fragile nested embeds (process_flow_transition
  // has two FKs to process_stage, which makes a process_stage embed ambiguous).
  const { data: flows } = await supabase
    .from('process_flow')
    .select('process_flow_id, name')
    .eq('entity_definition_id', entityDefinitionId)
    .is('deleted_at', null);

  const flowNameById = new Map(
    (flows ?? []).map((f: { process_flow_id: string; name: string }) => [f.process_flow_id, f.name]),
  );

  // Check process_stage_fields (stage visible/required fields)
  const { data: stageFields } = await supabase
    .from('process_stage_fields')
    .select('process_flow_id, field_logical_name, process_stage(name)')
    .eq('field_logical_name', fieldLogicalName);

  for (const sf of stageFields ?? []) {
    const flowId = sf.process_flow_id as string | null;
    if (!flowId || !flowNameById.has(flowId)) continue;
    const stage = sf.process_stage as { name?: string } | null;
    deps.push({
      type: 'process_flow',
      name: flowNameById.get(flowId) ?? 'Unknown Flow',
      location: `Stage: ${stage?.name ?? 'Unknown'}`,
      reason: `Field "${fieldLogicalName}" is required/visible in this stage`,
      recordId: flowId,
    });
  }

  // Check requires_fields in process_flow_transition
  const { data: transitions } = await supabase
    .from('process_flow_transition')
    .select('transition_id, requires_fields, process_flow_id, from_stage:process_stage!from_stage_id(name)')
    .contains('requires_fields', [fieldLogicalName]);

  for (const tr of transitions ?? []) {
    const flowId = tr.process_flow_id as string | null;
    if (!flowId || !flowNameById.has(flowId)) continue;
    const stage = tr.from_stage as { name?: string } | null;
    deps.push({
      type: 'process_flow',
      name: flowNameById.get(flowId) ?? 'Unknown Flow',
      location: `Stage transition from: ${stage?.name ?? 'Unknown'}`,
      reason: `Field "${fieldLogicalName}" is required before stage transition`,
      recordId: flowId,
    });
  }
}

async function checkColumnInWorkflows(
  entityDefinitionId: string,
  fieldLogicalName: string,
  deps: Dependency[],
) {
  const { data: workflows } = await supabase
    .from('workflow_definition')
    .select('workflow_id, name, trigger_conditions')
    .eq('entity_definition_id', entityDefinitionId)
    .is('deleted_at', null);

  for (const wf of workflows ?? []) {
    const trigStr = JSON.stringify(wf.trigger_conditions ?? '');
    if (trigStr.includes(fieldLogicalName)) {
      deps.push({
        type: 'workflow',
        name: wf.name,
        location: 'Trigger conditions',
        reason: `Field "${fieldLogicalName}" is referenced in the workflow trigger`,
      });
      continue;
    }

    const { data: steps } = await supabase
      .from('workflow_step')
      .select('step_id, name, config_json')
      .eq('workflow_id', wf.workflow_id);

    for (const step of steps ?? []) {
      const stepStr = JSON.stringify(step.config_json ?? '');
      if (stepStr.includes(fieldLogicalName)) {
        deps.push({
          type: 'workflow',
          name: wf.name,
          location: `Step: ${step.name}`,
          reason: `Field "${fieldLogicalName}" is referenced in this workflow step`,
        });
      }
    }
  }
}

async function checkColumnInColumnSecurity(
  entityLogicalName: string,
  fieldLogicalName: string,
  deps: Dependency[],
) {
  const { data: rows } = await supabase
    .from('column_security_profile_field')
    .select('profile_id, entity_name, field_name, column_security_profile(name)')
    .eq('entity_name', entityLogicalName)
    .eq('field_name', fieldLogicalName);

  for (const row of rows ?? []) {
    const profile = row.column_security_profile as { name?: string } | null;
    deps.push({
      type: 'column_security',
      name: profile?.name ?? 'Unknown Profile',
      location: 'Column security profile',
      reason: `Field is secured under this profile`,
    });
  }
}

/* ─── Entity dependency check ─── */
export async function checkEntityDependencies(
  entityDefinitionId: string,
  entityLogicalName: string,
  entityDisplayName: string,
): Promise<DependencyResult> {
  const deps: Dependency[] = [];

  await Promise.all([
    checkEntityInRelationships(entityDefinitionId, entityDisplayName, deps),
    checkEntityInForms(entityDefinitionId, entityLogicalName, deps),
    checkEntityInNavigation(entityLogicalName, deps),
    checkEntityInSecurityRoles(entityLogicalName, deps),
    checkEntityInProcessFlows(entityDefinitionId, deps),
    checkEntityInWorkflows(entityDefinitionId, deps),
  ]);

  return { canDelete: deps.length === 0, dependencies: deps };
}

async function checkEntityInRelationships(
  entityDefinitionId: string,
  entityDisplayName: string,
  deps: Dependency[],
) {
  // Other entities have lookups pointing TO this entity
  const { data: inbound } = await supabase
    .from('relationship_definition')
    .select('relationship_definition_id, display_name, source_entity:entity_definition!source_entity_id(display_name)')
    .eq('target_entity_id', entityDefinitionId)
    .is('deleted_at', null);

  for (const rel of inbound ?? []) {
    const src = rel.source_entity as { display_name?: string } | null;
    deps.push({
      type: 'relationship',
      name: rel.display_name ?? 'Unknown Relationship',
      location: `${src?.display_name ?? 'Unknown'} → ${entityDisplayName}`,
      reason: `Another entity has a lookup field pointing to ${entityDisplayName}`,
    });
  }

  // This entity has lookups pointing to other entities
  const { data: outbound } = await supabase
    .from('relationship_definition')
    .select('relationship_definition_id, display_name, target_entity:entity_definition!target_entity_id(display_name)')
    .eq('source_entity_id', entityDefinitionId)
    .is('deleted_at', null);

  for (const rel of outbound ?? []) {
    const tgt = rel.target_entity as { display_name?: string } | null;
    deps.push({
      type: 'relationship',
      name: rel.display_name ?? 'Unknown Relationship',
      location: `${entityDisplayName} → ${tgt?.display_name ?? 'Unknown'}`,
      reason: `This entity has a lookup field pointing to another entity`,
    });
  }
}

async function checkEntityInForms(
  entityDefinitionId: string,
  entityLogicalName: string,
  deps: Dependency[],
) {
  // Subgrids in other entities' forms that reference this entity
  const { data: allForms } = await supabase
    .from('form_definition')
    .select('form_id, name, entity_definition_id, layout_json')
    .neq('entity_definition_id', entityDefinitionId)
    .is('deleted_at', null);

  for (const form of allForms ?? []) {
    const layout = form.layout_json as { tabs?: unknown[] } | unknown[] | null;
    if (!layout) continue;
    const tabs = Array.isArray(layout) ? layout : (layout as { tabs?: unknown[] }).tabs ?? [];
    for (const tab of tabs as { label?: string; sections?: unknown[] }[]) {
      for (const sec of (tab.sections ?? []) as { label?: string; controls?: unknown[] }[]) {
        for (const ctrl of (sec.controls ?? []) as {
          control_type?: string;
          subgrid_config?: { related_entity_logical_name?: string };
          lookup_config?: { target_entity_id?: string };
        }[]) {
          const isSubgrid = ctrl.control_type === 'subgrid' &&
            ctrl.subgrid_config?.related_entity_logical_name === entityLogicalName;
          const isLookup = ctrl.control_type === 'field' &&
            ctrl.lookup_config?.target_entity_id === entityDefinitionId;

          if (isSubgrid || isLookup) {
            deps.push({
              type: 'form',
              name: form.name,
              location: `${tab.label ?? 'Tab'} → ${sec.label ?? 'Section'}`,
              reason: isSubgrid
                ? `Subgrid displays records from this entity`
                : `Lookup field references this entity`,
            });
          }
        }
      }
    }
  }
}

async function checkEntityInNavigation(
  entityLogicalName: string,
  deps: Dependency[],
) {
  const { data: navItems } = await supabase
    .from('nav_item')
    .select('nav_item_id, display_label, entity_name, nav_group(display_label)')
    .eq('entity_name', entityLogicalName);

  for (const item of navItems ?? []) {
    const grp = item.nav_group as { display_label?: string } | null;
    deps.push({
      type: 'navigation',
      name: item.display_label ?? entityLogicalName,
      location: `Navigation group: ${grp?.display_label ?? 'Unknown'}`,
      reason: 'Entity appears in the sidebar navigation. Remove the navigation item first.',
      recordId: item.nav_item_id,
    });
  }
}

async function checkEntityInSecurityRoles(
  entityLogicalName: string,
  deps: Dependency[],
) {
  const { data: privRows } = await supabase
    .from('role_privilege')
    .select('privilege_id, entity_name, security_role(name)')
    .eq('entity_name', entityLogicalName);

  const seen = new Set<string>();
  for (const priv of privRows ?? []) {
    const role = priv.security_role as { name?: string } | null;
    const roleName = role?.name ?? 'Unknown Role';
    if (seen.has(roleName)) continue;
    seen.add(roleName);
    deps.push({
      type: 'security_role',
      name: roleName,
      location: 'Entity privileges',
      reason: `Security role has privileges configured for this entity`,
    });
  }
}

async function checkEntityInProcessFlows(
  entityDefinitionId: string,
  deps: Dependency[],
) {
  const { data: flows } = await supabase
    .from('process_flow')
    .select('process_flow_id, name')
    .eq('entity_definition_id', entityDefinitionId)
    .is('deleted_at', null);

  for (const flow of flows ?? []) {
    deps.push({
      type: 'process_flow',
      name: flow.name,
      location: 'Process flow definition',
      reason: 'This process flow is attached to the entity',
    });
  }
}

async function checkEntityInWorkflows(
  entityDefinitionId: string,
  deps: Dependency[],
) {
  const { data: workflows } = await supabase
    .from('workflow_definition')
    .select('workflow_id, name')
    .eq('entity_definition_id', entityDefinitionId)
    .is('deleted_at', null);

  for (const wf of workflows ?? []) {
    deps.push({
      type: 'workflow',
      name: wf.name,
      location: 'Workflow definition',
      reason: 'This workflow is triggered by or acts on the entity',
    });
  }
}
