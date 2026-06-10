import { supabase } from '../lib/supabase';
import type {
  FormDefinition,
  FormScript,
  FormEventHandler,
  DesignerLayout,
} from '../types/form';

export async function fetchFormsForEntity(entityId: string): Promise<FormDefinition[]> {
  const { data, error } = await supabase
    .from('form_definition')
    .select('*')
    .eq('entity_definition_id', entityId)
    .is('deleted_at', null)
    .order('form_type')
    .order('name');
  if (error) throw error;
  return data as FormDefinition[];
}

export async function fetchQuickCreateFormsForEntity(
  entityId: string
): Promise<{ form_id: string; name: string; layout_json: FormDefinition['layout_json'] }[]> {
  const { data, error } = await supabase
    .from('form_definition')
    .select('form_id, name, layout_json')
    .eq('entity_definition_id', entityId)
    .eq('form_type', 'quick_create')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;
  return (data ?? []) as { form_id: string; name: string; layout_json: FormDefinition['layout_json'] }[];
}

export async function fetchFormById(formId: string): Promise<FormDefinition> {
  const { data, error } = await supabase
    .from('form_definition')
    .select('*')
    .eq('form_id', formId)
    .single();
  if (error) throw error;
  return data as FormDefinition;
}

export async function createForm(payload: {
  entity_definition_id: string;
  name: string;
  form_type: string;
  description?: string | null;
  is_default?: boolean;
  layout_json?: DesignerLayout;
}): Promise<FormDefinition> {
  const { data, error } = await supabase
    .from('form_definition')
    .insert({ ...payload, is_active: true, is_published: false })
    .select()
    .single();
  if (error) throw error;
  return data as FormDefinition;
}

export async function saveFormLayout(
  formId: string,
  layout: DesignerLayout,
  name?: string,
  description?: string | null
): Promise<FormDefinition> {
  if (!layout || !layout.tabs || !Array.isArray(layout.tabs)) {
    throw new Error('Cannot save: layout is missing or has no tabs');
  }

  const controlCount = layout.tabs.reduce(
    (n, t) => n + t.sections.reduce((m, s) => m + s.controls.length, 0), 0);
  console.log('[FormDesigner:save] form_id =', formId, 'tabs =', layout.tabs.length, 'controls =', controlCount);

  const updates: Record<string, unknown> = {
    layout_json: layout,
    modified_at: new Date().toISOString(),
  };
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;

  const { data, error } = await supabase
    .from('form_definition')
    .update(updates)
    .eq('form_id', formId)
    .select()
    .single();

  if (error) {
    console.error('[FormDesigner:save] DB error', error);
    throw error;
  }
  if (!data) throw new Error('Save returned no data — check RLS permissions');

  const saved = data as FormDefinition;

  const savedControlCount = (saved.layout_json?.tabs ?? []).reduce(
    (n: number, t: { sections: { controls: unknown[] }[] }) =>
      n + t.sections.reduce((m: number, s: { controls: unknown[] }) => m + s.controls.length, 0), 0);

  console.log(
    '[FormDesigner:save] verified — form_id =', saved.form_id,
    'modified_at =', saved.modified_at,
    'is_default =', saved.is_default,
    'saved_tabs =', saved.layout_json?.tabs?.length,
    'saved_controls =', savedControlCount
  );

  if (savedControlCount !== controlCount) {
    console.error('[FormDesigner:save] MISMATCH! Sent', controlCount, 'controls but DB has', savedControlCount);
  }

  return saved;
}

export async function renameForm(formId: string, newName: string): Promise<FormDefinition> {
  const { data, error } = await supabase
    .from('form_definition')
    .update({ name: newName, modified_at: new Date().toISOString() })
    .eq('form_id', formId)
    .select()
    .single();
  if (error) throw error;
  if (!data) throw new Error('Rename returned no data — check RLS permissions');
  return data as FormDefinition;
}

export async function publishForm(formId: string): Promise<FormDefinition> {
  const { data, error } = await supabase
    .from('form_definition')
    .update({
      is_published: true,
      is_active: true,
      published_at: new Date().toISOString(),
      modified_at: new Date().toISOString(),
    })
    .eq('form_id', formId)
    .select()
    .single();

  if (error) {
    console.error('[FormDesigner:publish] DB error', error);
    throw error;
  }

  console.log('[FormDesigner:publish] form_id =', formId, 'is_default =', data?.is_default, 'is_active =', data?.is_active);
  return data as FormDefinition;
}

export async function unpublishForm(formId: string): Promise<FormDefinition> {
  const { data, error } = await supabase
    .from('form_definition')
    .update({ is_published: false, modified_at: new Date().toISOString() })
    .eq('form_id', formId)
    .select()
    .single();
  if (error) throw error;
  return data as FormDefinition;
}

export async function softDeleteForm(formId: string): Promise<void> {
  const { error } = await supabase
    .from('form_definition')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('form_id', formId);
  if (error) throw error;
}

export async function cloneForm(formId: string, newName: string): Promise<FormDefinition> {
  const { data: source, error: fetchErr } = await supabase
    .from('form_definition')
    .select('*')
    .eq('form_id', formId)
    .single();
  if (fetchErr) throw fetchErr;

  const { form_id: _id, created_at: _ca, modified_at: _ma, deleted_at: _da, published_at: _pa, ...rest } = source as FormDefinition & { form_id: string; created_at: string; modified_at: string; deleted_at: string | null; published_at: string | null };

  const { data, error } = await supabase
    .from('form_definition')
    .insert({
      ...rest,
      name: newName,
      is_system: false,
      is_deletable: true,
      is_default: false,
      is_published: false,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as FormDefinition;
}

export async function fetchScripts(formId: string): Promise<FormScript[]> {
  const { data, error } = await supabase
    .from('form_script')
    .select('*')
    .eq('form_id', formId)
    .order('display_order');
  if (error) throw error;
  return data as FormScript[];
}

export async function upsertScript(
  formId: string,
  script: Partial<FormScript> & { script_id?: string }
): Promise<FormScript> {
  const payload = { ...script, form_id: formId };
  if (payload.script_id) {
    const { data, error } = await supabase
      .from('form_script')
      .update(payload)
      .eq('script_id', payload.script_id)
      .select()
      .single();
    if (error) throw error;
    return data as FormScript;
  } else {
    const { data, error } = await supabase
      .from('form_script')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as FormScript;
  }
}

export async function deleteScript(scriptId: string): Promise<void> {
  const { error } = await supabase.from('form_script').delete().eq('script_id', scriptId);
  if (error) throw error;
}

export async function fetchEventHandlers(formId: string): Promise<FormEventHandler[]> {
  const { data, error } = await supabase
    .from('form_event_handler')
    .select('*')
    .eq('form_id', formId)
    .order('event_type')
    .order('display_order');
  if (error) throw error;
  return data as FormEventHandler[];
}

export async function upsertEventHandler(
  formId: string,
  handler: Partial<FormEventHandler> & { handler_id?: string }
): Promise<FormEventHandler> {
  const payload = { ...handler, form_id: formId };
  if (payload.handler_id) {
    const { data, error } = await supabase
      .from('form_event_handler')
      .update(payload)
      .eq('handler_id', payload.handler_id)
      .select()
      .single();
    if (error) throw error;
    return data as FormEventHandler;
  } else {
    const { data, error } = await supabase
      .from('form_event_handler')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as FormEventHandler;
  }
}

export async function deleteEventHandler(handlerId: string): Promise<void> {
  const { error } = await supabase
    .from('form_event_handler')
    .delete()
    .eq('handler_id', handlerId);
  if (error) throw error;
}
