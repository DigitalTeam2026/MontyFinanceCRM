import { supabase } from '../lib/supabase';
import type { BusinessRuleCategory } from '../types/businessRule';

// Accent palette for new categories — cycled by index so fresh categories get
// distinct colors without a color picker.
export const RULE_CATEGORY_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#0d9488', '#4f46e5'];

// ── Business rule categories ─────────────────────────────────────────────────
// Named, color-coded folders used to group business rules on the rules list.
// Optional: a rule with category_id = null falls into an "Uncategorized" group.
// Categories are global (shared across entities). Deleting a category detaches
// its rules (FK SET NULL); it never deletes the rules.

export async function fetchRuleCategories(): Promise<BusinessRuleCategory[]> {
  const { data, error } = await supabase
    .from('business_rule_category')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as BusinessRuleCategory[];
}

export async function createRuleCategory(payload: {
  name: string;
  color?: string;
  sort_order?: number;
  created_by?: string | null;
}): Promise<BusinessRuleCategory> {
  const { data, error } = await supabase
    .from('business_rule_category')
    .insert({
      name: payload.name,
      color: payload.color ?? '#64748b',
      sort_order: payload.sort_order ?? 0,
      created_by: payload.created_by ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as BusinessRuleCategory;
}

export async function updateRuleCategory(
  categoryId: string,
  updates: Partial<Pick<BusinessRuleCategory, 'name' | 'color' | 'sort_order'>>,
): Promise<BusinessRuleCategory> {
  const { data, error } = await supabase
    .from('business_rule_category')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('business_rule_category_id', categoryId)
    .select()
    .single();
  if (error) throw error;
  return data as BusinessRuleCategory;
}

/** Delete a category. Rules keep existing; their category_id is set null by the FK. */
export async function deleteRuleCategory(categoryId: string): Promise<void> {
  const { error } = await supabase
    .from('business_rule_category')
    .delete()
    .eq('business_rule_category_id', categoryId);
  if (error) throw error;
}

/** Move a single rule into (or out of, with null) a category. */
export async function setBusinessRuleCategory(ruleId: string, categoryId: string | null): Promise<void> {
  const { error } = await supabase
    .from('business_rule')
    .update({ category_id: categoryId, modified_at: new Date().toISOString() })
    .eq('business_rule_id', ruleId);
  if (error) throw error;
}
