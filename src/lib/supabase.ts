// src/lib/supabase.ts
// -----------------------------------------------------------------------------
// LOCAL SUPABASE-COMPATIBLE ADAPTER
// -----------------------------------------------------------------------------
// Supabase cloud has been removed. This module re-implements the subset of the
// Supabase JS client that this project uses, but every call is routed to the
// local Node/Express API (server/index.js) which talks to local PostgreSQL.
//
//   React/Vite frontend
//     -> src/lib/supabase.ts   (this adapter)
//       -> http://172.16.78.27:3001   (Node/Express)
//         -> local PostgreSQL (monty_finance_crm)
//
// NOTE: There is NO `import { createClient } from '@supabase/supabase-js'` here,
// and no VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY usage. The only env var
// consumed is VITE_API_URL.
//
// Supported `supabase.from(table)` chain:
//   select / insert / update / delete / upsert
//   eq / neq / in / is / gt / gte / lt / lte / like / ilike / or / not
//   order / limit / range / single / maybeSingle
//   select(cols, { count: 'exact', head: true })
// Plus: supabase.rpc(), supabase.auth.*, supabase.storage.*, supabase.channel().
// -----------------------------------------------------------------------------

import { API_URL, sendRaw } from './api';
import type { ApiError } from './api';

export type { ApiError };

// Minimal auth types (replacements for @supabase/supabase-js type imports).
export interface AuthUser {
  id: string;
  email: string;
  role?: string;
  name?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// Supabase-style response.
// `data` is intentionally `any` (as the previous Supabase client was typed) so
// existing call sites keep working without per-call generics.
export interface PostgrestResponse {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  error: ApiError | null;
  count: number | null;
  status: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filter = Record<string, any>;

interface OrderSpec {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
}

type Operation = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

// -----------------------------------------------------------------------------
// Query builder
// -----------------------------------------------------------------------------

class QueryBuilder<T = any> implements PromiseLike<PostgrestResponse> {
  private table: string;
  private operation: Operation = 'select';

  private selectStr: string | null = null;
  private wantCount = false;
  private headOnly = false;

  private filters: Filter[] = [];
  private orders: OrderSpec[] = [];
  private limitVal: number | null = null;
  private offsetVal: number | null = null;

  private singleVal = false;
  private maybeSingleVal = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private payload: any = null;
  private onConflict: string | undefined;

  constructor(table: string) {
    this.table = table;
  }

  // --- column selection -----------------------------------------------------

  select(columns?: string, options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    if (this.operation === 'select') {
      // Starting (or refining) a read query.
      this.selectStr = columns ?? '*';
    } else if (columns) {
      // Chained after insert/update/delete/upsert -> request returning rows.
      this.selectStr = columns;
    }
    if (options?.count) this.wantCount = true;
    if (options?.head) this.headOnly = true;
    return this;
  }

  // --- mutations ------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert(values: any) {
    this.operation = 'insert';
    this.payload = values;
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upsert(values: any, options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.operation = 'upsert';
    this.payload = values;
    this.onConflict = options?.onConflict;
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update(values: any) {
    this.operation = 'update';
    this.payload = values;
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  // --- filters --------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eq(column: string, value: any) {
    this.filters.push({ type: 'eq', column, value });
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  neq(column: string, value: any) {
    this.filters.push({ type: 'neq', column, value });
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gt(column: string, value: any) {
    this.filters.push({ type: 'gt', column, value });
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gte(column: string, value: any) {
    this.filters.push({ type: 'gte', column, value });
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lt(column: string, value: any) {
    this.filters.push({ type: 'lt', column, value });
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lte(column: string, value: any) {
    this.filters.push({ type: 'lte', column, value });
    return this;
  }
  like(column: string, pattern: string) {
    this.filters.push({ type: 'like', column, value: pattern });
    return this;
  }
  ilike(column: string, pattern: string) {
    this.filters.push({ type: 'ilike', column, value: pattern });
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  is(column: string, value: any) {
    this.filters.push({ type: 'is', column, value });
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  in(column: string, values: any[]) {
    this.filters.push({ type: 'in', column, value: values });
    return this;
  }
  // Array / jsonb containment (PostgREST cs operator: column @> value).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contains(column: string, value: any) {
    this.filters.push({ type: 'contains', column, value });
    return this;
  }
  // Array / jsonb overlap (PostgREST ov operator: column && value).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  overlaps(column: string, value: any) {
    this.filters.push({ type: 'overlaps', column, value });
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  not(column: string, operator: string, value: any) {
    this.filters.push({ type: 'not', column, op: operator, value });
    return this;
  }
  or(expression: string) {
    this.filters.push({ type: 'or', expr: expression });
    return this;
  }
  // PostgREST generic .filter(column, operator, value) — map to not()/leaf.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter(column: string, operator: string, value: any) {
    this.filters.push({ type: operator, column, value });
    return this;
  }

  // --- ordering / pagination ------------------------------------------------

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({
      column,
      ascending: options?.ascending !== false,
      nullsFirst: options?.nullsFirst,
    });
    return this;
  }

  limit(count: number) {
    this.limitVal = count;
    return this;
  }

  range(from: number, to: number) {
    this.offsetVal = from;
    this.limitVal = to - from + 1;
    return this;
  }

  single() {
    this.singleVal = true;
    return this;
  }

  maybeSingle() {
    this.maybeSingleVal = true;
    return this;
  }

  // --- execution ------------------------------------------------------------

  private async run(): Promise<PostgrestResponse> {
    let path = `/api/${this.table}`;
    let method = 'POST';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;

    if (this.operation === 'select') {
      method = 'POST';
      body = {
        action: 'select',
        select: this.selectStr ?? '*',
        count: this.wantCount,
        head: this.headOnly,
        filters: this.filters,
        order: this.orders,
        limit: this.limitVal ?? undefined,
        offset: this.offsetVal ?? undefined,
        single: this.singleVal,
        maybeSingle: this.maybeSingleVal,
      };
    } else if (this.operation === 'insert' || this.operation === 'upsert') {
      method = 'POST';
      body = {
        values: this.payload,
        upsert: this.operation === 'upsert',
        onConflict: this.onConflict,
        single: this.singleVal,
        maybeSingle: this.maybeSingleVal,
      };
    } else if (this.operation === 'update') {
      method = 'PATCH';
      body = {
        values: this.payload,
        filters: this.filters,
        single: this.singleVal,
        maybeSingle: this.maybeSingleVal,
      };
    } else {
      method = 'DELETE';
      body = {
        filters: this.filters,
        single: this.singleVal,
        maybeSingle: this.maybeSingleVal,
      };
    }

    const { ok, status, body: resBody } = await sendRaw<any>(path, {
      method,
      body: JSON.stringify(body),
    });

    if (!ok) {
      const error: ApiError = (resBody && resBody.error) || {
        message: `Request failed with status ${status}`,
        status,
      };
      return { data: null as unknown as T, error, count: null, status };
    }

    return {
      data: (resBody?.data ?? null) as T,
      error: null,
      count: resBody?.count ?? null,
      status,
    };
  }

  then<TResult1 = PostgrestResponse, TResult2 = never>(
    onfulfilled?: ((value: PostgrestResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  catch(onrejected?: ((reason: any) => any) | null) {
    return this.run().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null) {
    return this.run().finally(onfinally);
  }
}

// -----------------------------------------------------------------------------
// RPC (Postgres functions)
// -----------------------------------------------------------------------------

async function rpc<T = any>(
  functionName: string,
  params?: Record<string, unknown>
): Promise<PostgrestResponse> {
  const { ok, status, body } = await sendRaw<any>(`/api/rpc/${functionName}`, {
    method: 'POST',
    body: JSON.stringify(params ?? {}),
  });

  if (!ok) {
    const error: ApiError = (body && body.error) || {
      message: `RPC ${functionName} failed with status ${status}`,
      status,
    };
    return { data: null as unknown as T, error, count: null, status };
  }

  return { data: (body?.data ?? null) as T, error: null, count: null, status };
}

// -----------------------------------------------------------------------------
// Auth — token-based against the local API (/api/auth/login + /api/auth/session).
// A session exists only after a successful password login; the signed token is
// stored in localStorage and re-validated against the server on every load.
// -----------------------------------------------------------------------------

const AUTH_TOKEN_KEY = 'crm-auth-token';
const AUTH_USER_KEY = 'crm-auth-user';

function storedToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function storedUser(): AuthUser | null {
  const saved = localStorage.getItem(AUTH_USER_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved) as AuthUser;
  } catch {
    return null;
  }
}

function persistAuth(token: string, user: AuthUser): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

function clearAuth(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

function makeSession(token: string, user: AuthUser): Session {
  return {
    access_token: token,
    refresh_token: token,
    token_type: 'bearer',
    expires_in: 12 * 60 * 60,
    user,
  };
}

// Subscribers registered via onAuthStateChange. Notified on sign-in / sign-out
// so the React shell (App.tsx) can react without polling.
type AuthListener = (event: string, session: Session | null) => void;
const authListeners: AuthListener[] = [];
function notifyAuth(event: string, session: Session | null): void {
  for (const cb of authListeners) {
    try {
      cb(event, session);
    } catch {
      /* a listener throwing must not break the others */
    }
  }
}

const auth = {
  // Validate the stored token against the server. Returns a live session, or
  // null when there is no token or it is invalid/expired (clearing local state).
  async getSession() {
    const token = storedToken();
    if (!token) return { data: { session: null }, error: null };
    const { ok, status, body } = await sendRaw<any>('/api/auth/session', {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Network failure (server down): don't discard the token — keep it so a later
    // reload can revalidate once the API is reachable again.
    if (!ok && status === 0) {
      return { data: { session: null }, error: null };
    }
    const user = body?.data?.user as AuthUser | undefined;
    if (!user) {
      // Server reachable and said "no valid session" → the token is dead.
      clearAuth();
      return { data: { session: null }, error: null };
    }
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    return { data: { session: makeSession(token, user) }, error: null };
  },

  async getUser() {
    return { data: { user: storedUser() } };
  },

  async refreshSession() {
    return auth.getSession();
  },

  async signInWithPassword(credentials: { email?: string; password?: string; code?: string }) {
    const { ok, body } = await sendRaw<any>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
        code: credentials.code,
      }),
    });
    // Password was correct but the account has 2FA on: the caller must collect a
    // code and call again with it. No session is issued yet.
    if (ok && body?.data?.mfa_required) {
      return { data: { user: null, session: null }, error: null, mfaRequired: true };
    }
    const token = body?.data?.token as string | undefined;
    const user = body?.data?.user as AuthUser | undefined;
    if (!ok || !token || !user) {
      const error: ApiError = (body && body.error) || {
        message: 'Invalid email or password.',
        status: 401,
      };
      return { data: { user: null, session: null }, error, mfaRequired: false };
    }
    persistAuth(token, user);
    const session = makeSession(token, user);
    notifyAuth('SIGNED_IN', session);
    return { data: { user, session }, error: null, mfaRequired: false };
  },

  async signOut(_options?: { scope?: 'global' | 'local' | 'others' }) {
    clearAuth();
    notifyAuth('SIGNED_OUT', null);
    return { error: null };
  },

  onAuthStateChange(callback: AuthListener) {
    authListeners.push(callback);
    return {
      data: {
        subscription: {
          unsubscribe() {
            const i = authListeners.indexOf(callback);
            if (i >= 0) authListeners.splice(i, 1);
          },
        },
      },
    };
  },
};

// -----------------------------------------------------------------------------
// Storage — local disk storage via the backend (/api/storage/:bucket).
// -----------------------------------------------------------------------------

function bucketApi(bucket: string) {
  return {
    async upload(
      path: string,
      file: File | Blob,
      options?: { upsert?: boolean; cacheControl?: string; contentType?: string }
    ) {
      try {
        const buffer = await file.arrayBuffer();
        // Base64-encode the bytes for a dependency-free JSON upload.
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        const contentBase64 = btoa(binary);

        const { ok, status, body } = await sendRaw<any>(
          `/api/storage/${bucket}/upload`,
          {
            method: 'POST',
            body: JSON.stringify({
              path,
              contentBase64,
              contentType: options?.contentType || (file as File).type || 'application/octet-stream',
              upsert: options?.upsert ?? false,
            }),
          }
        );
        if (!ok) {
          return { data: null, error: (body && body.error) || { message: `Upload failed (${status})`, status } };
        }
        return { data: { path }, error: null };
      } catch (err) {
        return {
          data: null,
          error: { message: err instanceof Error ? err.message : 'Upload failed' },
        };
      }
    },

    getPublicUrl(path: string) {
      return { data: { publicUrl: `${API_URL}/storage/${bucket}/${path}` } };
    },

    async download(path: string) {
      try {
        const res = await fetch(`${API_URL}/storage/${bucket}/${path}`);
        if (!res.ok) return { data: null, error: { message: `Download failed (${res.status})`, status: res.status } };
        const blob = await res.blob();
        return { data: blob, error: null };
      } catch (err) {
        return { data: null, error: { message: err instanceof Error ? err.message : 'Download failed' } };
      }
    },

    async remove(paths: string[]) {
      const { ok, status, body } = await sendRaw<any>(`/api/storage/${bucket}/remove`, {
        method: 'POST',
        body: JSON.stringify({ paths }),
      });
      if (!ok) return { data: null, error: (body && body.error) || { message: `Remove failed (${status})`, status } };
      return { data: body?.data ?? null, error: null };
    },

    async createSignedUrl(path: string) {
      // No signing locally — return the public URL.
      return { data: { signedUrl: `${API_URL}/storage/${bucket}/${path}` }, error: null };
    },
  };
}

const storage = {
  from: bucketApi,
};

// -----------------------------------------------------------------------------
// Realtime — inert stub. Live updates are not available in local mode; channels
// no-op so subscribing components keep working (they just won't receive pushes).
// -----------------------------------------------------------------------------

interface ChannelStub {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on: (...args: any[]) => ChannelStub;
  subscribe: (callback?: (status: string) => void) => ChannelStub;
  unsubscribe: () => Promise<'ok'>;
  topic: string;
}

function channel(name: string): ChannelStub {
  const stub: ChannelStub = {
    topic: name,
    on() {
      return stub;
    },
    subscribe(callback) {
      if (callback) setTimeout(() => callback('SUBSCRIBED'), 0);
      return stub;
    },
    async unsubscribe() {
      return 'ok';
    },
  };
  return stub;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function removeChannel(_channel: any): Promise<'ok'> {
  return 'ok';
}

// -----------------------------------------------------------------------------
// Edge functions — not available locally. Returns a clear error (callers that
// rely on these features must be ported to a local endpoint).
// -----------------------------------------------------------------------------

const functions = {
  async invoke(
    name: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _options?: { body?: any }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ data: any; error: { message: string } | null }> {
    return {
      data: null,
      error: {
        message: `Edge function "${name}" is not available in local mode. A local API endpoint is required.`,
      },
    };
  },
};

// -----------------------------------------------------------------------------
// Client
// -----------------------------------------------------------------------------

export const supabase = {
  // The builder is fully typed internally, but `from()` is exposed as `any` to
  // mirror the previous `supabase: any` client. This keeps the ~80 existing call
  // sites (which relied on untyped chaining) compiling without modification.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string): any => new QueryBuilder(table),
  rpc,
  auth,
  storage,
  channel,
  removeChannel,
  functions,
};

// -----------------------------------------------------------------------------
// Auth-error helpers (kept from the previous implementation).
// -----------------------------------------------------------------------------

export function isAuthError(error: ApiError | Error | null | undefined): boolean {
  if (!error) return false;

  const status = 'status' in error ? (error as ApiError).status : undefined;
  if (status === 401 || status === 403) return true;

  if ('message' in error && typeof error.message === 'string') {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('unauthorized') ||
      msg.includes('forbidden') ||
      msg.includes('permission denied') ||
      msg.includes('invalid token') ||
      msg.includes('jwt expired')
    );
  }

  return false;
}

export async function handleAuthError(
  error: ApiError | Error | null | undefined
): Promise<boolean> {
  if (!isAuthError(error)) return false;
  localStorage.removeItem(LOCAL_USER_KEY);
  window.location.reload();
  return true;
}

// Re-export the low-level helper for callers that imported it previously.
export { api } from './api';
