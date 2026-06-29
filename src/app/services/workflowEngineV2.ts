// workflowEngineV2 — the nested workflow engine, a faithful TS port of the
// reference engine.js. Power Automate controls: variables, compose, condition,
// switch, apply_to_each, do_until, scope, delay, terminate — plus expression-aware
// value resolution via workflowExpressions.evaluate.
//
// A flow is a nested JSON tree: { enabled, trigger, steps }. Containers
// (condition/switch/loops/scope) hold child step lists and run recursively.
//
// Two production seams (as in the reference): the scheduler (swap for a durable
// queue) and persistence (store flows + traces in the DB).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { evaluate, type ExprContext } from './workflowExpressions';

// ---------- flow / event shapes ----------
export interface FlowDefinition {
  id?: string;
  name?: string;
  enabled?: boolean;
  trigger?: FlowTrigger;
  steps?: FlowStep[];
}
export interface FlowTrigger {
  type?: string;
  entity?: string;
  conditions?: FlowCondition[];
}
export interface FlowCondition { field?: string; op: string; value?: any; }
export type FlowStep = Record<string, any>;

export interface FlowEvent {
  type: string;
  entity: string;
  recordId?: string;
  record?: Record<string, unknown>;
  before?: Record<string, unknown>;
  changedFields?: string[];
}

export type ActionFn = (params: any, ctx: RunContext) => Promise<any> | any;

interface RunContext extends ExprContext {
  trigger: Record<string, unknown>;
  record: Record<string, unknown>;
  before: Record<string, unknown>;
  changedFields: string[];
  variables: Record<string, unknown>;
  varTypes: Record<string, VarType>;   // declared type per variable (from initialize_variable)
  steps: Record<string, unknown>;
  item?: unknown;
}

// ---------- typed variables (Power Automate: Initialize variable picks a type) ----------
export type VarType = 'String' | 'Integer' | 'Boolean' | 'Float' | 'Array' | 'Object';
export const VAR_TYPES: VarType[] = ['String', 'Integer', 'Boolean', 'Float', 'Array', 'Object'];

function defaultForType(t: VarType): unknown {
  switch (t) {
    case 'String':  return '';
    case 'Integer':
    case 'Float':   return 0;
    case 'Boolean': return false;
    case 'Array':   return [];
    case 'Object':  return {};
  }
}

// Coerce a raw value into the variable's declared type, rejecting values that
// can't be represented (e.g. an Integer variable can't hold "abc").
function coerceVar(t: VarType, raw: unknown): unknown {
  switch (t) {
    case 'String':
      return raw == null ? '' : typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
    case 'Integer': {
      const n = typeof raw === 'boolean' ? (raw ? 1 : 0) : Number(raw);
      if (!Number.isFinite(n)) throw new Error(`Integer variable expects a whole number, got ${JSON.stringify(raw)}`);
      return Math.trunc(n);
    }
    case 'Float': {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`Float variable expects a number, got ${JSON.stringify(raw)}`);
      return n;
    }
    case 'Boolean': {
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true' || raw === 1 || raw === '1') return true;
      if (raw === 'false' || raw === 0 || raw === '0' || raw == null || raw === '') return false;
      return Boolean(raw);
    }
    case 'Array': {
      if (Array.isArray(raw)) return raw;
      if (raw == null || raw === '') return [];
      if (typeof raw === 'string') { try { const p = JSON.parse(raw); if (Array.isArray(p)) return p; } catch { /* not JSON */ } }
      throw new Error(`Array variable expects an array, got ${JSON.stringify(raw)}`);
    }
    case 'Object': {
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
      if (raw == null || raw === '') return {};
      if (typeof raw === 'string') { try { const p = JSON.parse(raw); if (p && typeof p === 'object' && !Array.isArray(p)) return p; } catch { /* not JSON */ } }
      throw new Error(`Object variable expects an object, got ${JSON.stringify(raw)}`);
    }
  }
}

type StopSignal = { stop?: boolean; status?: string; message?: string } | null;

// ---------- value resolution: @{expression} and {{path}} ----------
function getPath(obj: any, path: string): any {
  return path.split('.').reduce((o: any, k: string) => (o == null ? undefined : o[k]), obj);
}
function stringifyVal(v: any): string {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
function interpolate(str: string, ctx: RunContext): any {
  const exprExact = str.match(/^@\{([\s\S]+)\}$/);          // whole string is one @{...} -> typed value
  if (exprExact) return evaluate(exprExact[1], ctx);
  const pathExact = str.match(/^\{\{\s*([\w.]+)\s*\}\}$/);  // whole string is one {{path}} -> typed value
  if (pathExact) return getPath(ctx, pathExact[1]);
  return str                                                // embedded -> stringify each token
    .replace(/@\{([\s\S]+?)\}/g, (_, e) => stringifyVal(evaluate(e, ctx)))
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, p) => stringifyVal(getPath(ctx, p)));
}
function resolve(value: any, ctx: RunContext): any {
  if (typeof value === 'string') return interpolate(value, ctx);
  if (Array.isArray(value)) return value.map((v) => resolve(v, ctx));
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value)) out[k] = resolve(value[k], ctx);
    return out;
  }
  return value;
}

// ---------- trigger matching ----------
// Compare loosely so a value picked in the UI (always a string) matches the typed
// value on the record — boolean true vs "true", number 10 vs "10", etc.
function looseEq(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == b;
  const boolStr = (x: any) => (x === true || x === 'true') ? 'true' : (x === false || x === 'false') ? 'false' : null;
  const ba = boolStr(a), bb = boolStr(b);
  if (ba !== null && bb !== null) return ba === bb;
  const na = Number(a), nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && a !== '' && b !== '') return na === nb;
  return String(a) === String(b);
}
function evalCondition(cond: FlowCondition, ctx: RunContext): boolean {
  if (cond.op === 'changed') {
    const field = String(cond.field).split('.').pop() as string;
    return (ctx.changedFields || []).includes(field);
  }
  const left = cond.field ? getPath(ctx, cond.field) : undefined;
  switch (cond.op) {
    case 'equals':       return looseEq(left, cond.value);
    case 'not_equals':   return !looseEq(left, cond.value);
    case 'greater_than': return Number(left) > Number(cond.value);
    case 'less_than':    return Number(left) < Number(cond.value);
    case 'contains':     return String(left ?? '').includes(cond.value);
    case 'in': {
      const list = Array.isArray(cond.value)
        ? cond.value
        : String(cond.value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      return list.some((v) => looseEq(left, v));
    }
    case 'is_empty':     return left == null || left === '';
    default: throw new Error(`Unknown operator: ${cond.op}`);
  }
}
function evalAll(conditions: FlowCondition[] | undefined, ctx: RunContext): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => evalCondition(c, ctx));
}
export function matchesTrigger(trigger: FlowTrigger | undefined, event: FlowEvent, ctx: RunContext): boolean {
  if (!trigger) return false;
  if (trigger.type && trigger.type !== event.type) return false;
  if (trigger.entity && trigger.entity !== event.entity) return false;
  return evalAll(trigger.conditions, ctx);
}

// ---------- engine ----------
export interface RunResult {
  ok?: boolean;
  skipped?: string;
  status?: string;
  variables?: Record<string, unknown>;
  trace: any[];
}

export class FlowEngine {
  private actions = new Map<string, ActionFn>();
  private scheduler: { schedule: (ms: number, fn: () => void) => void };

  constructor(opts: { scheduler?: { schedule: (ms: number, fn: () => void) => void } } = {}) {
    // PRODUCTION: swap for a durable delayed job so long waits survive restarts.
    this.scheduler = opts.scheduler || { schedule: (ms, fn) => setTimeout(fn, ms) };
  }

  registerAction(name: string, fn: ActionFn): this { this.actions.set(name, fn); return this; }

  async run(workflow: FlowDefinition, event: FlowEvent): Promise<RunResult> {
    const ctx: RunContext = {
      trigger: { type: event.type, entity: event.entity, recordId: event.recordId },
      record: event.record || {},
      before: event.before || {},
      changedFields: event.changedFields || [],
      variables: {},
      varTypes: {},
      steps: {},
      item: undefined,
    };
    const trace: any[] = [];
    if (!workflow.enabled) return { skipped: 'disabled', trace };
    if (!matchesTrigger(workflow.trigger, event, ctx)) return { skipped: 'trigger_no_match', trace };

    const sig = await this.runSteps(workflow.steps || [], ctx, trace);
    return { ok: true, status: sig && sig.status ? sig.status : 'Succeeded', variables: ctx.variables, trace };
  }

  private async runSteps(steps: FlowStep[], ctx: RunContext, trace: any[]): Promise<StopSignal> {
    for (const step of steps) {
      const sig = await this.runStep(step, ctx, trace);
      if (sig && sig.stop) return sig;
    }
    return null;
  }

  private async runStep(step: FlowStep, ctx: RunContext, trace: any[]): Promise<StopSignal> {
    const val = (s: FlowStep) => (s.expression != null ? evaluate(s.expression, ctx) : resolve(s.value, ctx));

    switch (step.type) {
      case 'initialize_variable': {    // declare name + type once; coerce the initial value
        const type = (step.varType || 'String') as VarType;
        const hasVal = step.value !== undefined || step.expression != null;
        const coerced = coerceVar(type, hasVal ? val(step) : defaultForType(type));
        ctx.variables[step.name] = coerced;
        ctx.varTypes[step.name] = type;
        trace.push({ step: step.name, type: 'initialize_variable', varType: type, value: coerced });
        return null;
      }
      case 'set_variable': {           // assign a value; coerce to the declared type if known
        const t = ctx.varTypes[step.name];
        const raw = val(step);
        ctx.variables[step.name] = t ? coerceVar(t, raw) : raw;
        trace.push({ step: step.name, type: 'set_variable', value: ctx.variables[step.name] });
        return null;
      }
      case 'increment_variable': {     // numbers only
        const t = ctx.varTypes[step.name];
        if (t && t !== 'Integer' && t !== 'Float') throw new Error(`increment_variable: '${step.name}' is ${t}, not a number`);
        const by = step.by == null ? 1 : Number(resolve(step.by, ctx));
        if (!Number.isFinite(by)) throw new Error(`increment_variable: step amount is not a number (${JSON.stringify(step.by)})`);
        const next = (Number(ctx.variables[step.name]) || 0) + by;
        ctx.variables[step.name] = t === 'Integer' ? Math.trunc(next) : next;
        trace.push({ step: step.name, type: 'increment_variable', value: ctx.variables[step.name] });
        return null;
      }
      case 'append_to_variable': {     // arrays only
        const t = ctx.varTypes[step.name];
        if (t && t !== 'Array') throw new Error(`append_to_variable: '${step.name}' is ${t}, not an Array`);
        if (!Array.isArray(ctx.variables[step.name])) ctx.variables[step.name] = [];
        const v = val(step);
        (ctx.variables[step.name] as any[]).push(v);
        trace.push({ step: step.name, type: 'append_to_variable', value: v });
        return null;
      }
      case 'compose': {                // data operation: output a value for later steps
        const v = val(step);
        ctx.steps[step.id] = v;
        trace.push({ step: step.id, type: 'compose', output: v });
        return null;
      }
      case 'condition': {
        const pass = step.expression != null ? Boolean(evaluate(step.expression, ctx)) : evalAll(step.conditions, ctx);
        trace.push({ step: step.id || 'condition', type: 'condition', pass });
        return this.runSteps(pass ? (step.then || []) : (step.else || []), ctx, trace);
      }
      case 'switch': {
        const on = step.expression != null ? evaluate(step.expression, ctx) : resolve(step.on, ctx);
        const branch = (step.cases && step.cases[on as any]) || step.default || [];
        trace.push({ step: step.id || 'switch', type: 'switch', on });
        return this.runSteps(branch, ctx, trace);
      }
      case 'apply_to_each': {
        const arr = step.expression != null ? evaluate(step.expression, ctx) : resolve(step.items, ctx);
        trace.push({ step: step.id || 'apply_to_each', type: 'apply_to_each', count: (arr || []).length });
        const prev = ctx.item;
        for (const it of (arr as any[]) || []) {
          ctx.item = it;
          const sig = await this.runSteps(step.do || [], ctx, trace);
          if (sig && sig.stop) { ctx.item = prev; return sig; }
        }
        ctx.item = prev;
        return null;
      }
      case 'do_until': {
        const max = step.maxIterations || 60;
        let n = 0;
        trace.push({ step: step.id || 'do_until', type: 'do_until' });
        do {
          const sig = await this.runSteps(step.do || [], ctx, trace);
          if (sig && sig.stop) return sig;
          n++;
        } while (!evaluate(step.until, ctx) && n < max);
        return null;
      }
      case 'scope': {                  // group steps; optional error handling
        trace.push({ step: step.id || 'scope', type: 'scope' });
        try {
          return await this.runSteps(step.do || [], ctx, trace);
        } catch (err: any) {
          trace.push({ step: step.id || 'scope', type: 'scope_error', error: String(err?.message) });
          if (step.catch) return this.runSteps(step.catch, ctx, trace);
          throw err;
        }
      }
      case 'delay': {
        const ms = step.ms || 0;
        trace.push({ step: step.id || 'delay', type: 'delay', ms });
        await new Promise<void>((res) => this.scheduler.schedule(ms, res));
        return null;
      }
      case 'terminate': {
        const sig: StopSignal = { stop: true, status: step.status || 'Succeeded', message: resolve(step.message || '', ctx) };
        trace.push({ step: step.id || 'terminate', type: 'terminate', status: sig!.status, message: sig!.message });
        return sig;
      }
      case 'action': {                 // side-effecting functions: send_email, create_task, http_request...
        const fn = this.actions.get(step.action);
        if (!fn) throw new Error(`No action registered: ${step.action}`);
        const params = resolve(step.params || {}, ctx);
        const result = await fn(params, ctx);
        ctx.steps[step.id] = result;
        trace.push({ step: step.id, action: step.action, params, result });
        return null;
      }
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }
}
