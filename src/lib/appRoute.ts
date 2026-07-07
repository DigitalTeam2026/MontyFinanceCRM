// Centralized hash-route serialization for the whole app.
//
// Goal: a browser refresh (F5 / Ctrl+R / hard refresh / in-app refresh) must
// restore the EXACT location the user was viewing — surface (CRM vs Admin
// Studio), module, entity, the open record (and its active tab), the active
// saved view, the keyword search, and any filtered-list context. The URL hash
// is the single source of truth that survives a reload; React state is rebuilt
// from it on mount.
//
// All writes use history.replaceState (no history churn, never fires
// 'hashchange') so internal navigation stays a single-page experience while the
// URL silently tracks context for the next reload.

import type { AppEntity, AppModule } from '../app/types';

// Core entities map deterministically to a navigation module. Dynamic/custom
// entities aren't listed here and fall back to 'sales' for sidebar context.
export const ENTITY_MODULE_MAP: Record<string, AppModule> = {
  accounts: 'sales',
  contacts: 'sales',
  leads: 'sales',
  opportunities: 'sales',
  tickets: 'support',
  prospect: 'sales',
  prospects: 'sales',
};

export function moduleForEntity(entity: AppEntity, fallback: AppModule = 'sales'): AppModule {
  return ENTITY_MODULE_MAP[entity] ?? fallback;
}

// Minimal serialized shapes for a filtered list. Kept structurally compatible
// with listService.ActiveFilter and CrmApp's parent-filter context so they can
// be cast at the boundary without importing service code into this lib.
export interface SerializedFilter {
  id: string;
  field: string;
  label: string;
  operator: string;
  value: unknown;
}
export interface SerializedParentFilter {
  fkColumn: string;
  parentId: string;
  parentLabel: string;
  parentEntity: string;
}
export interface FilteredListData {
  filters: SerializedFilter[];
  contextLabel: string;
  parentFilter?: SerializedParentFilter;
}

export type CrmRouteView =
  | { type: 'dashboard' }
  | { type: 'list' }
  | { type: 'new' }
  | { type: 'record'; id: string; tab?: string }
  | { type: 'filtered-list'; data: FilteredListData };

export interface CrmRoute {
  surface: 'crm';
  module: AppModule;
  entity: AppEntity;
  view: CrmRouteView;
  viewId?: string; // active saved view (list only)
  search?: string; // keyword search (list only)
}

export type StudioEntityView = 'list' | 'new' | 'edit' | 'detail' | 'data' | 'recycle';

export type StudioDashboardView = 'list' | 'create' | 'designer' | 'themes' | 'permissions';

export interface StudioRoute {
  surface: 'studio';
  module: string; // active Admin Studio page, e.g. 'entities' | 'forms' | ...
  entityId?: string; // selected entity definition id (sub-context)
  entityView?: StudioEntityView; // sub-view within the entities module
  dashboardId?: string; // selected dashboard id (dashboards module sub-context)
  dashboardView?: StudioDashboardView; // sub-view within the dashboards module
}

// The login page is a real, addressable route (#/login) so the URL reflects the
// auth gate. It carries no sub-state — the auth layer decides what renders.
export interface LoginRoute {
  surface: 'login';
}

export type AppRoute = CrmRoute | StudioRoute | LoginRoute;

const DEFAULT_CRM: CrmRoute = {
  surface: 'crm',
  module: 'sales',
  entity: 'accounts',
  view: { type: 'dashboard' },
};

// `raw` has already been percent-decoded once by URLSearchParams, so we parse
// it directly — no second decodeURIComponent (which would throw on literal '%').
function decodeData<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Split the current hash into path segments + a query string. */
function splitHash(): { segs: string[]; query: URLSearchParams } {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const qIdx = raw.indexOf('?');
  const path = qIdx === -1 ? raw : raw.slice(0, qIdx);
  const queryStr = qIdx === -1 ? '' : raw.slice(qIdx + 1);
  return {
    segs: path.split('/').filter(Boolean),
    query: new URLSearchParams(queryStr),
  };
}

/** Parse the current location hash into a fully-resolved app route. */
export function parseRoute(): AppRoute {
  const { segs, query } = splitHash();
  const head = segs[0];

  if (head === 'login') {
    return { surface: 'login' };
  }

  if (head === 'studio') {
    const entityView = query.get('ev');
    const dashboardView = query.get('dv');
    return {
      surface: 'studio',
      module: segs[1] || 'entities',
      entityId: query.get('eid') ?? undefined,
      entityView: (entityView as StudioEntityView) || undefined,
      dashboardId: query.get('did') ?? undefined,
      dashboardView: (dashboardView as StudioDashboardView) || undefined,
    };
  }

  // Backward-compatible record route: #/record/<entity>/<id>[?tab=...]
  if (head === 'record') {
    const entity = segs[1];
    const id = segs[2];
    if (entity && id) {
      return {
        surface: 'crm',
        module: moduleForEntity(entity),
        entity,
        view: { type: 'record', id, tab: query.get('tab') ?? undefined },
      };
    }
  }

  // CRM app route: #/app/<module>/<entity>[/new|/filtered|/dashboard][?view=&q=&d=]
  if (head === 'app') {
    const module = segs[1] || 'sales';
    const entity = segs[2];
    if (entity) {
      const sub = segs[3];
      if (sub === 'new') {
        return { surface: 'crm', module, entity, view: { type: 'new' } };
      }
      if (sub === 'dashboard') {
        return { surface: 'crm', module, entity, view: { type: 'dashboard' } };
      }
      if (sub === 'filtered') {
        const data = decodeData<FilteredListData>(query.get('d') ?? '');
        if (data && Array.isArray(data.filters)) {
          return { surface: 'crm', module, entity, view: { type: 'filtered-list', data } };
        }
        // Bad/stale payload → fall back to the plain list for this entity.
      }
      return {
        surface: 'crm',
        module,
        entity,
        view: { type: 'list' },
        viewId: query.get('view') ?? undefined,
        search: query.get('q') ?? undefined,
      };
    }
  }

  return DEFAULT_CRM;
}

function withQuery(base: string, params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') q.set(k, v);
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** Build the hash (including leading '#') for a CRM route. */
export function buildCrmHash(route: Omit<CrmRoute, 'surface'>): string {
  const { module, entity, view, viewId, search } = route;
  if (view.type === 'dashboard') {
    return `#/app/${module}/${entity}/dashboard`;
  }
  if (view.type === 'record') {
    return withQuery(`#/record/${entity}/${view.id}`, { tab: view.tab });
  }
  const base = `#/app/${module}/${entity}`;
  if (view.type === 'new') return `${base}/new`;
  if (view.type === 'filtered-list') {
    // URLSearchParams (via withQuery) percent-encodes the JSON; decodeData
    // reverses it on parse. Keeps encode/decode symmetric for all values.
    return withQuery(`${base}/filtered`, { d: JSON.stringify(view.data) });
  }
  return withQuery(base, { view: viewId, q: search });
}

/** Build the hash (including leading '#') for an Admin Studio route. */
export function buildStudioHash(route: Omit<StudioRoute, 'surface'>): string {
  return withQuery(`#/studio/${route.module}`, {
    eid: route.entityId,
    ev: route.entityView && route.entityView !== 'list' ? route.entityView : undefined,
    did: route.dashboardId,
    dv: route.dashboardView && route.dashboardView !== 'list' ? route.dashboardView : undefined,
  });
}

/**
 * Replace the location hash without touching the page/search portion of the URL
 * and without creating a history entry or firing 'hashchange'. Used to keep the
 * URL in sync with in-app navigation so a reload restores the same context.
 */
export function replaceHash(hash: string): void {
  const base = `${window.location.pathname}${window.location.search}`;
  const next = `${base}${hash}`;
  if (window.location.pathname + window.location.search + window.location.hash !== next) {
    window.history.replaceState(null, '', next);
  }
}
