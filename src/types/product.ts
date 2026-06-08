export type ProductType = 'standard' | 'bundle' | 'service' | 'subscription' | 'internal';
export type ProductAccessMode = 'unrestricted' | 'restricted';
export type ProductUserAccessType = 'allow' | 'deny';

export interface LineOfBusiness {
  lob_id: string;
  name: string;
  description: string;
  code: string;
  is_active: boolean;
  is_system: boolean;
  display_order: number;
  business_unit_id: string | null;
  created_at: string;
  modified_at: string;
  deleted_at: string | null;
}

export interface ProductFamily {
  family_id: string;
  lob_id: string | null;
  name: string;
  description: string;
  code: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  modified_at: string;
}

export interface Product {
  product_id: string;
  lob_id: string | null;
  family_id: string | null;
  name: string;
  description: string;
  code: string;
  product_type: ProductType;
  access_mode: ProductAccessMode;
  is_active: boolean;
  is_system: boolean;
  default_process_flow_id: string | null;
  default_form_id: string | null;
  requires_approval: boolean;
  requires_compliance_review: boolean;
  requires_technical_review: boolean;
  requires_settlement_review: boolean;
  business_unit_id: string | null;
  display_order: number;
  created_at: string;
  created_by: string | null;
  modified_at: string;
  modified_by: string | null;
  deleted_at: string | null;
}

export interface ProductBuAccess {
  id: string;
  product_id: string;
  business_unit_id: string;
  granted_by: string | null;
  granted_at: string;
}

export interface ProductRoleAccess {
  id: string;
  product_id: string;
  role_id: string;
  granted_by: string | null;
  granted_at: string;
}

export interface ProductTeamAccess {
  id: string;
  product_id: string;
  team_id: string;
  granted_by: string | null;
  granted_at: string;
}

export interface ProductUserAccess {
  id: string;
  product_id: string;
  crm_user_id: string;
  access_type: ProductUserAccessType;
  granted_by: string | null;
  granted_at: string;
}

export interface ProductAccessSnapshot {
  buIds: string[];
  roleIds: string[];
  teamIds: string[];
  userOverrides: ProductUserAccess[];
}

export interface LineOfBusinessFormData {
  name: string;
  description: string;
  code: string;
  is_active: boolean;
  display_order: number;
}

export interface ProductFamilyFormData {
  lob_id: string | null;
  name: string;
  description: string;
  code: string;
  is_active: boolean;
  display_order: number;
}

export interface ProductFormData {
  lob_id: string | null;
  family_id: string | null;
  name: string;
  description: string;
  code: string;
  product_type: ProductType;
  access_mode: ProductAccessMode;
  is_active: boolean;
  default_process_flow_id: string | null;
  default_form_id: string | null;
  requires_approval: boolean;
  requires_compliance_review: boolean;
  requires_technical_review: boolean;
  requires_settlement_review: boolean;
  business_unit_id: string | null;
  display_order: number;
}

export const PRODUCT_TYPE_META: Record<ProductType, { label: string; color: string; description: string }> = {
  standard:     { label: 'Standard',     color: '#3b82f6', description: 'A regular single product offering' },
  bundle:       { label: 'Bundle',       color: '#f59e0b', description: 'A packaged combination of products' },
  service:      { label: 'Service',      color: '#10b981', description: 'A service-based product' },
  subscription: { label: 'Subscription', color: '#0ea5e9', description: 'A recurring subscription product' },
  internal:     { label: 'Internal',     color: '#6b7280', description: 'Internal use / not customer-facing' },
};
