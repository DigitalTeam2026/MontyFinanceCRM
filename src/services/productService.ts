import { supabase } from '../lib/supabase';
import type {
  LineOfBusiness,
  ProductFamily,
  Product,
  LineOfBusinessFormData,
  ProductFamilyFormData,
  ProductFormData,
  ProductBuAccess,
  ProductRoleAccess,
  ProductTeamAccess,
  ProductUserAccess,
  ProductAccessSnapshot,
  ProductUserAccessType,
} from '../types/product';

// ─── Lines of Business ────────────────────────────────────────────────────────

export async function fetchLinesOfBusiness(): Promise<LineOfBusiness[]> {
  const { data, error } = await supabase
    .from('line_of_business')
    .select('*')
    .is('deleted_at', null)
    .order('display_order')
    .order('name');
  if (error) throw error;
  return data as LineOfBusiness[];
}

export async function createLineOfBusiness(payload: LineOfBusinessFormData): Promise<LineOfBusiness> {
  const { data, error } = await supabase
    .from('line_of_business')
    .insert({ ...payload, is_system: false })
    .select()
    .single();
  if (error) throw error;
  return data as LineOfBusiness;
}

export async function updateLineOfBusiness(
  lobId: string,
  updates: Partial<LineOfBusinessFormData>
): Promise<LineOfBusiness> {
  const { data, error } = await supabase
    .from('line_of_business')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('lob_id', lobId)
    .select()
    .single();
  if (error) throw error;
  return data as LineOfBusiness;
}

export async function softDeleteLineOfBusiness(lobId: string): Promise<void> {
  const { error } = await supabase
    .from('line_of_business')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('lob_id', lobId);
  if (error) throw error;
}

// ─── Product Families ─────────────────────────────────────────────────────────

export async function fetchProductFamilies(lobId?: string): Promise<ProductFamily[]> {
  let query = supabase.from('product_family').select('*').order('display_order').order('name');
  if (lobId) query = query.eq('lob_id', lobId);
  const { data, error } = await query;
  if (error) throw error;
  return data as ProductFamily[];
}

export async function createProductFamily(payload: ProductFamilyFormData): Promise<ProductFamily> {
  const { data, error } = await supabase
    .from('product_family')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as ProductFamily;
}

export async function updateProductFamily(
  familyId: string,
  updates: Partial<ProductFamilyFormData>
): Promise<ProductFamily> {
  const { data, error } = await supabase
    .from('product_family')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('family_id', familyId)
    .select()
    .single();
  if (error) throw error;
  return data as ProductFamily;
}

export async function deleteProductFamily(familyId: string): Promise<void> {
  const { error } = await supabase
    .from('product_family')
    .delete()
    .eq('family_id', familyId);
  if (error) throw error;
}

// ─── Products ────────────────────────────────────────────────────────────────

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('product')
    .select('*')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('display_order')
    .order('name');
  if (error) throw error;
  return data as Product[];
}

export async function fetchProductsForLob(lobId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('product')
    .select('*')
    .eq('lob_id', lobId)
    .is('deleted_at', null)
    .order('display_order')
    .order('name');
  if (error) throw error;
  return data as Product[];
}

export async function createProduct(payload: ProductFormData): Promise<Product> {
  const { data, error } = await supabase
    .from('product')
    .insert({ ...payload, is_system: false })
    .select()
    .single();
  if (error) throw error;
  return data as Product;
}

export async function updateProduct(
  productId: string,
  updates: Partial<ProductFormData>
): Promise<Product> {
  const { data, error } = await supabase
    .from('product')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('product_id', productId)
    .select()
    .single();
  if (error) throw error;
  return data as Product;
}

export async function softDeleteProduct(productId: string): Promise<void> {
  const { error } = await supabase
    .from('product')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('product_id', productId);
  if (error) throw error;
}

// ─── Product Access Control ───────────────────────────────────────────────────

export async function fetchProductAccessSnapshot(productId: string): Promise<ProductAccessSnapshot> {
  const [buRes, roleRes, teamRes, userRes] = await Promise.all([
    supabase.from('product_business_unit_access').select('*').eq('product_id', productId),
    supabase.from('product_role_access').select('*').eq('product_id', productId),
    supabase.from('product_team_access').select('*').eq('product_id', productId),
    supabase.from('product_user_access').select('*').eq('product_id', productId),
  ]);
  if (buRes.error) throw buRes.error;
  if (roleRes.error) throw roleRes.error;
  if (teamRes.error) throw teamRes.error;
  if (userRes.error) throw userRes.error;

  return {
    buIds: (buRes.data as ProductBuAccess[]).map((r) => r.business_unit_id),
    roleIds: (roleRes.data as ProductRoleAccess[]).map((r) => r.role_id),
    teamIds: (teamRes.data as ProductTeamAccess[]).map((r) => r.team_id),
    userOverrides: userRes.data as ProductUserAccess[],
  };
}

export async function addProductBuAccess(productId: string, businessUnitId: string): Promise<void> {
  const { error } = await supabase
    .from('product_business_unit_access')
    .insert({ product_id: productId, business_unit_id: businessUnitId });
  if (error) throw error;
}

export async function removeProductBuAccess(productId: string, businessUnitId: string): Promise<void> {
  const { error } = await supabase
    .from('product_business_unit_access')
    .delete()
    .eq('product_id', productId)
    .eq('business_unit_id', businessUnitId);
  if (error) throw error;
}

export async function addProductRoleAccess(productId: string, roleId: string): Promise<void> {
  const { error } = await supabase
    .from('product_role_access')
    .insert({ product_id: productId, role_id: roleId });
  if (error) throw error;
}

export async function removeProductRoleAccess(productId: string, roleId: string): Promise<void> {
  const { error } = await supabase
    .from('product_role_access')
    .delete()
    .eq('product_id', productId)
    .eq('role_id', roleId);
  if (error) throw error;
}

export async function addProductTeamAccess(productId: string, teamId: string): Promise<void> {
  const { error } = await supabase
    .from('product_team_access')
    .insert({ product_id: productId, team_id: teamId });
  if (error) throw error;
}

export async function removeProductTeamAccess(productId: string, teamId: string): Promise<void> {
  const { error } = await supabase
    .from('product_team_access')
    .delete()
    .eq('product_id', productId)
    .eq('team_id', teamId);
  if (error) throw error;
}

export async function upsertProductUserAccess(
  productId: string,
  crmUserId: string,
  accessType: ProductUserAccessType
): Promise<void> {
  const { error } = await supabase
    .from('product_user_access')
    .upsert(
      { product_id: productId, crm_user_id: crmUserId, access_type: accessType },
      { onConflict: 'product_id,crm_user_id' }
    );
  if (error) throw error;
}

export async function removeProductUserAccess(productId: string, crmUserId: string): Promise<void> {
  const { error } = await supabase
    .from('product_user_access')
    .delete()
    .eq('product_id', productId)
    .eq('crm_user_id', crmUserId);
  if (error) throw error;
}

export function resolveProductVisibility(
  product: Product,
  userBuId: string | null,
  userRoleIds: string[],
  userTeamIds: string[],
  snapshot: ProductAccessSnapshot,
  userId: string
): boolean {
  if (product.access_mode === 'unrestricted') return true;

  const userOverride = snapshot.userOverrides.find((o) => o.crm_user_id === userId);
  if (userOverride?.access_type === 'deny') return false;
  if (userOverride?.access_type === 'allow') return true;

  if (userBuId && snapshot.buIds.includes(userBuId)) return true;
  if (userRoleIds.some((rid) => snapshot.roleIds.includes(rid))) return true;
  if (userTeamIds.some((tid) => snapshot.teamIds.includes(tid))) return true;

  return false;
}
