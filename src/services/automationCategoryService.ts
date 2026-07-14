import { supabase } from '../lib/supabase';
import type { AutomationCategory } from '../types/automationRule';

// ── Power Automation flow categories ─────────────────────────────────────────
// Named, color-coded folders used to group flows into collapsible sections on
// the Power Automation list. Optional: a rule with category_id = null falls into
// an "Uncategorized" group. Deleting a category detaches its rules (SET NULL),
// it never deletes the flows.

export async function fetchCategories(): Promise<AutomationCategory[]> {
  const { data, error } = await supabase
    .from('automation_category')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AutomationCategory[];
}

export async function createCategory(payload: {
  name: string;
  color?: string;
  sort_order?: number;
  created_by?: string | null;
}): Promise<AutomationCategory> {
  const { data, error } = await supabase
    .from('automation_category')
    .insert({
      name: payload.name,
      color: payload.color ?? '#64748b',
      sort_order: payload.sort_order ?? 0,
      created_by: payload.created_by ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AutomationCategory;
}

export async function updateCategory(
  categoryId: string,
  updates: Partial<Pick<AutomationCategory, 'name' | 'color' | 'sort_order'>>,
): Promise<AutomationCategory> {
  const { data, error } = await supabase
    .from('automation_category')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('automation_category_id', categoryId)
    .select()
    .single();
  if (error) throw error;
  return data as AutomationCategory;
}

/** Delete a category. Rules keep existing; their category_id is set null by the FK. */
export async function deleteCategory(categoryId: string): Promise<void> {
  const { error } = await supabase
    .from('automation_category')
    .delete()
    .eq('automation_category_id', categoryId);
  if (error) throw error;
}

/** Move a single rule into (or out of, with null) a category. */
export async function setRuleCategory(ruleId: string, categoryId: string | null): Promise<void> {
  const { error } = await supabase
    .from('automation_rule')
    .update({ category_id: categoryId, modified_at: new Date().toISOString() })
    .eq('automation_rule_id', ruleId);
  if (error) throw error;
}
