// Power-Automate-style expression language for the workflow engine.
// Faithful TS port of the reference engine's expressions.js: everything is a
// function call or a literal (no infix operators) over a run context, e.g.
//   concat('Hi ', record('name'))
//   add(variables('total'), mul(item('qty'), item('price')))
//   formatDateTime(utcNow(), 'yyyy-MM-dd')

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ExprContext {
  record: Record<string, unknown>;
  variables: Record<string, unknown>;
  steps: Record<string, unknown>;   // outputs('stepId')
  item?: unknown;                    // item() inside apply_to_each
  trigger?: Record<string, unknown>;
  before?: Record<string, unknown>;
  changedFields?: string[];
}

type Token = { t: string; v?: any };

// ---------------- tokenizer ----------------
function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const identStart = (c: string) => /[A-Za-z_]/.test(c);
  const identChar = (c: string) => /[A-Za-z0-9_]/.test(c);
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(') { tokens.push({ t: 'lp' }); i++; continue; }
    if (c === ')') { tokens.push({ t: 'rp' }); i++; continue; }
    if (c === ',') { tokens.push({ t: 'comma' }); i++; continue; }
    if (c === "'") {                       // single-quoted string; '' = literal quote
      let s = ''; i++;
      while (i < src.length) {
        if (src[i] === "'") {
          if (src[i + 1] === "'") { s += "'"; i += 2; continue; }
          i++; break;
        }
        s += src[i++];
      }
      tokens.push({ t: 'str', v: s });
      continue;
    }
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(src[i + 1] || ''))) {
      let n = c; i++;
      while (i < src.length && /[0-9.]/.test(src[i])) n += src[i++];
      tokens.push({ t: 'num', v: parseFloat(n) });
      continue;
    }
    if (identStart(c)) {
      let id = c; i++;
      while (i < src.length && identChar(src[i])) id += src[i++];
      tokens.push({ t: 'ident', v: id });
      continue;
    }
    throw new Error(`Unexpected character '${c}' in expression`);
  }
  return tokens;
}

// ---------------- parser ----------------
type Ast = { k: 'lit'; v: any } | { k: 'call'; name: string; args: Ast[] };

function parse(tokens: Token[]): Ast {
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];

  function expr(): Ast {
    const tok = peek();
    if (!tok) throw new Error('Unexpected end of expression');
    if (tok.t === 'str' || tok.t === 'num') { eat(); return { k: 'lit', v: tok.v }; }
    if (tok.t === 'ident') {
      eat();
      if (tok.v === 'true') return { k: 'lit', v: true };
      if (tok.v === 'false') return { k: 'lit', v: false };
      if (tok.v === 'null') return { k: 'lit', v: null };
      if (peek() && peek().t === 'lp') {
        eat();
        const args: Ast[] = [];
        if (peek() && peek().t !== 'rp') {
          args.push(expr());
          while (peek() && peek().t === 'comma') { eat(); args.push(expr()); }
        }
        if (!peek() || peek().t !== 'rp') throw new Error(`Missing ) after ${tok.v}(`);
        eat();
        return { k: 'call', name: tok.v, args };
      }
      throw new Error(`'${tok.v}' must be written as a function, e.g. ${tok.v}(...)`);
    }
    throw new Error('Unexpected token in expression');
  }

  const ast = expr();
  if (pos !== tokens.length) throw new Error('Unexpected tokens after expression');
  return ast;
}

// ---------------- function library ----------------
function getPath(obj: any, path: any): any {
  return String(path).split('.').reduce((o: any, k: string) => (o == null ? undefined : o[k]), obj);
}

function pad2(n: number) { return String(n).padStart(2, '0'); }
function formatDate(d: Date, pattern?: string): string {
  return (pattern || 'yyyy-MM-ddTHH:mm:ss')
    .replace(/yyyy/g, String(d.getFullYear()))
    .replace(/MM/g, pad2(d.getMonth() + 1))
    .replace(/dd/g, pad2(d.getDate()))
    .replace(/HH/g, pad2(d.getHours()))
    .replace(/mm/g, pad2(d.getMinutes()))
    .replace(/ss/g, pad2(d.getSeconds()));
}

function buildFns(ctx: ExprContext): Record<string, (a: any[]) => any> {
  return {
    // ----- references into the run context -----
    variables: (a) => (ctx.variables || {})[a[0]],
    outputs:   (a) => (ctx.steps || {})[a[0]],
    item:      (a) => (a.length ? getPath(ctx.item, a[0]) : ctx.item),
    record:    (a) => (a.length ? getPath(ctx.record, a[0]) : ctx.record),
    trigger:   (a) => (a.length ? getPath(ctx, a[0]) : ctx.trigger),

    // ----- string -----
    concat:     (a) => a.map((x) => (x == null ? '' : String(x))).join(''),
    substring:  (a) => String(a[0]).substr(a[1], a[2]),
    replace:    (a) => String(a[0]).split(a[1]).join(a[2]),
    toLower:    (a) => String(a[0]).toLowerCase(),
    toUpper:    (a) => String(a[0]).toUpperCase(),
    trim:       (a) => String(a[0]).trim(),
    indexOf:    (a) => String(a[0]).indexOf(a[1]),
    startsWith: (a) => String(a[0]).startsWith(a[1]),
    endsWith:   (a) => String(a[0]).endsWith(a[1]),
    split:      (a) => String(a[0]).split(a[1]),
    guid:       () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                  const r = (Math.random() * 16) | 0;
                  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
                }),

    // ----- logic / comparison -----
    equals:          (a) => a[0] === a[1],
    not:             (a) => !a[0],
    greater:         (a) => a[0] > a[1],
    greaterOrEquals: (a) => a[0] >= a[1],
    less:            (a) => a[0] < a[1],
    lessOrEquals:    (a) => a[0] <= a[1],

    // ----- math -----
    add: (a) => Number(a[0]) + Number(a[1]),
    sub: (a) => Number(a[0]) - Number(a[1]),
    mul: (a) => Number(a[0]) * Number(a[1]),
    div: (a) => Number(a[0]) / Number(a[1]),
    mod: (a) => Number(a[0]) % Number(a[1]),
    min: (a) => Math.min(...a.map(Number)),
    max: (a) => Math.max(...a.map(Number)),

    // ----- collections -----
    length:   (a) => (a[0] == null ? 0 : a[0].length),
    first:    (a) => (Array.isArray(a[0]) ? a[0][0] : String(a[0])[0]),
    last:     (a) => (Array.isArray(a[0]) ? a[0][a[0].length - 1] : String(a[0]).slice(-1)),
    join:     (a) => (a[0] || []).join(a[1]),
    contains: (a) => (Array.isArray(a[0]) ? a[0].includes(a[1]) : String(a[0]).includes(a[1])),
    empty:    (a) => a[0] == null || a[0].length === 0,
    take:     (a) => (a[0] || []).slice(0, a[1]),
    skip:     (a) => (a[0] || []).slice(a[1]),

    // ----- conversion -----
    string: (a) => (a[0] == null ? '' : String(a[0])),
    int:    (a) => parseInt(a[0], 10),
    float:  (a) => parseFloat(a[0]),
    bool:   (a) => Boolean(a[0]),
    json:   (a) => JSON.parse(a[0]),
    array:  (a) => (Array.isArray(a[0]) ? a[0] : a[0] == null ? [] : [a[0]]),

    // ----- date/time -----
    utcNow:         (a) => formatDate(new Date(), a[0]),
    addDays:        (a) => formatDate(new Date(new Date(a[0]).getTime() + a[1] * 86400000), a[2]),
    addHours:       (a) => formatDate(new Date(new Date(a[0]).getTime() + a[1] * 3600000), a[2]),
    formatDateTime: (a) => formatDate(new Date(a[0]), a[1]),
  };
}

// ---------------- interpreter (short-circuits if/and/or/coalesce) ----------------
function interpret(ast: Ast, fns: Record<string, (a: any[]) => any>, ctx: ExprContext): any {
  if (ast.k === 'lit') return ast.v;
  if (ast.k !== 'call') throw new Error('Bad AST node');

  const name = ast.name;
  if (name === 'if')  return interpret(ast.args[0], fns, ctx) ? interpret(ast.args[1], fns, ctx) : interpret(ast.args[2], fns, ctx);
  if (name === 'and') return ast.args.every((a) => Boolean(interpret(a, fns, ctx)));
  if (name === 'or')  return ast.args.some((a) => Boolean(interpret(a, fns, ctx)));
  if (name === 'coalesce') {
    for (const a of ast.args) { const v = interpret(a, fns, ctx); if (v != null) return v; }
    return null;
  }

  const fn = fns[name];
  if (!fn) throw new Error(`Unknown function: ${name}()`);
  return fn(ast.args.map((a) => interpret(a, fns, ctx)));
}

export function evaluate(exprString: string, ctx: ExprContext): unknown {
  return interpret(parse(tokenize(exprString)), buildFns(ctx), ctx);
}
