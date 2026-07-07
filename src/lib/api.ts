// src/lib/api.ts
// Low-level transport to the local Node/Express API (which talks to local PostgreSQL).
// The Supabase-compatible adapter in ./supabase.ts is built on top of this.

// Same-origin by default: calls go to "/api/...", "/health", "/storage" on
// whatever host serves the page. IIS (prod) and the Vite dev server both
// reverse-proxy those paths to the Node API (localhost:API_PORT), so there is
// no hardcoded IP/port anywhere in the frontend. Set VITE_API_URL only if you
// ever need to point the UI at a remote API on a different origin.
export const API_URL = import.meta.env.VITE_API_URL ?? '';

// Same key the auth adapter (supabase.ts) persists the session token under.
// Kept as a literal here to avoid a circular import with the higher-level adapter.
const AUTH_TOKEN_KEY = 'crm-auth-token';

// The Bearer header for the current session, if any. Sent on every request so
// the server can resolve the caller (auth.uid()) for privilege-checked RPCs.
function authHeader(): Record<string, string> {
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export type ApiError = {
  message: string;
  status?: number;
  code?: string;
};

export type RawResult<T = unknown> = {
  ok: boolean;
  status: number;
  body: T;
};

/**
 * Send a request and ALWAYS resolve (never throw on HTTP errors).
 * Returns the parsed JSON body plus ok/status so callers can map to a
 * Supabase-style { data, error } shape themselves.
 */
export async function sendRaw<T = any>(
  path: string,
  options?: RequestInit
): Promise<RawResult<T>> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(),
        ...(options?.headers || {}),
      },
      ...options,
    });

    let body: any = null;
    const text = await response.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { error: { message: text } };
      }
    }

    return { ok: response.ok, status: response.status, body };
  } catch (err) {
    // Network / fetch failure.
    return {
      ok: false,
      status: 0,
      body: {
        error: {
          message: err instanceof Error ? err.message : 'Network request failed',
          status: 0,
        },
      } as any,
    };
  }
}

/**
 * Convenience helper that THROWS on failure (for simple callers that prefer
 * try/catch over { data, error }).
 */
export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const { ok, status, body } = await sendRaw<any>(path, options);
  if (!ok) {
    const message =
      (body && body.error && body.error.message) || `API request failed with status ${status}`;
    throw { message, status } as ApiError;
  }
  return (body && 'data' in body ? body.data : body) as T;
}

/**
 * Small high-level helper for quick CRUD against the local API.
 * Most of the app goes through the Supabase-compatible adapter instead.
 */
export const api = {
  health: () => request('/health'),

  tables: () => request('/api/tables'),

  list: <T = any>(table: string, limit = 100) =>
    sendRaw<{ data: T[] }>(`/api/${table}?limit=${limit}`).then((r) => r.body.data),

  count: (table: string) =>
    sendRaw<{ count: number }>(`/api/${table}/count`).then((r) => r.body.count),

  create: <T = any>(table: string, values: Record<string, any>) =>
    request<T>(`/api/${table}`, {
      method: 'POST',
      body: JSON.stringify({ values }),
    }),

  update: <T = any>(table: string, values: Record<string, any>, filters: any[]) =>
    request<T>(`/api/${table}`, {
      method: 'PATCH',
      body: JSON.stringify({ values, filters }),
    }),

  remove: <T = any>(table: string, filters: any[]) =>
    request<T>(`/api/${table}`, {
      method: 'DELETE',
      body: JSON.stringify({ filters }),
    }),
};
