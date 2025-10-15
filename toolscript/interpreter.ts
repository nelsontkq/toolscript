import { Cond, PlanNode, Value, VarRef } from "./parser.ts";

export type JSONLike = null | boolean | number | string | JSONLike[] | {
  [k: string]: JSONLike;
};
export type Capability = (args: JSONLike) => Promise<JSONLike> | JSONLike;
export type Capabilities = Record<string, Capability>;

export type ExecutionOptions = {
  maxSteps?: number;
  deadlineMs?: number;
  dryRun?: boolean;
};

export type ExecutionResult = {
  ok: boolean;
  return?: JSONLike;
  error?: string;
  vars: Record<string, JSONLike>;
  trace: Array<{ kind: string; info: any }>;
};

export async function executeToolScript(
  plan: PlanNode,
  caps: Capabilities = {},
  options: ExecutionOptions = {},
): Promise<ExecutionResult> {
  const vars: Record<string, JSONLike> = {};
  const trace: ExecutionResult["trace"] = [];
  const start = Date.now();
  const maxSteps = options.maxSteps ?? 1000;
  let steps = 0;

  const deadline = options.deadlineMs ? start + options.deadlineMs : Infinity;
  const checkLimits = () => {
    if (++steps > maxSteps) {
      throw new Error("Step limit exceeded");
    }
    if (Date.now() > deadline) {
      throw new Error("Deadline exceeded");
    }
  };

  const resolveValue = (v: Value | VarRef): JSONLike => {
    switch (v.kind) {
      case "Number":
        return v.value;
      case "Bool":
        return v.value;
      case "Null":
        return null;
      case "String":
        return v.value;
      case "Bare": {
        if (Object.prototype.hasOwnProperty.call(vars, v.value)) {
          return vars[v.value];
        }
        if (v.value === "true") {
          return true;
        }
        if (v.value === "false") {
          return false;
        }
        if (v.value === "null") {
          return null;
        }
        const n = Number(v.value);
        return Number.isNaN(n) ? v.value : n;
      }
      case "Array":
        return v.items.map(resolveValue);
      case "Map": {
        const obj: Record<string, JSONLike> = {};
        for (const e of v.entries) obj[e.key] = resolveValue(e.value);
        return obj;
      }
      default: {
        let cur = vars[v.path[0]];
        if (cur == null) {
          return null;
        }
        for (let k = 1; k < v.path.length; k++) {
          cur = cur[v.path[k] as keyof typeof cur];
        }
        return cur;
      }
    }
  };

  const evalCond = (c: Cond): boolean => {
    switch (c.kind) {
      case "Not":
        return !evalCond(c.inner);
      case "And":
        return evalCond(c.left) && evalCond(c.right);
      case "Or":
        return evalCond(c.left) || evalCond(c.right);
      case "Cmp": {
        const l = resolveValue(c.left);
        const r = resolveValue(c.right);
        if (l === null || r === null) {
          return l === r;
        }
        switch (c.op) {
          case "==":
            return l === r;
          case "!=":
            return l !== r;
          case "<":
            return l < r;
          case "<=":
            return l <= r;
          case ">":
            return l > r;
          case ">=":
            return l >= r;
        }
      }
    }
  };

  const runBlock = async (node: PlanNode): Promise<JSONLike | undefined> => {
    checkLimits();
    const body = node.kind === "Script" || node.kind === "Block"
      ? node.body
      : [];
    for (const s of body) {
      checkLimits();
      if (Date.now() > deadline) {
        throw new Error("Deadline exceeded");
      }
      switch (s.kind) {
        case "Empty":
          continue;
        case "Let": {
          vars[s.name] = resolveValue(s.expr);
          trace.push({
            kind: "LET",
            info: { name: s.name, value: vars[s.name] },
          });
          break;
        }
        case "Call": {
          const cap = caps[s.call.name];
          if (!cap) {
            throw new Error(`Unknown tool: ${s.call.name}`);
          }
          const argsObj: Record<string, JSONLike> = {};
          for (const [k, v] of Object.entries(s.call.args)) {
            argsObj[k] = resolveValue(v);
          }
          let result: JSONLike = null;
          if (!options.dryRun) {
            result = await Promise.resolve(cap(argsObj));
          }
          if (s.call.capture) {
            vars[s.call.capture] = result;
          }
          trace.push({
            kind: "CALL",
            info: {
              name: s.call.name,
              args: argsObj,
              capture: s.call.capture,
              result,
            },
          });
          break;
        }
        case "If": {
          const ok = evalCond(s.cond);
          trace.push({ kind: "IF", info: { cond: s.cond, value: ok } });
          const ret = await runBlock(
            ok ? s.then : s.else ?? { kind: "Block", body: [] },
          );
          if (ret !== undefined) {
            return ret;
          }
          break;
        }
        case "For": {
          const collection = resolveValue(s.iterable);
          if (!Array.isArray(collection)) {
            throw new Error("FOR expects iterable to resolve to an array");
          }
          const hadPrior = Object.prototype.hasOwnProperty.call(vars, s.item);
          const prior = vars[s.item];
          for (let idx = 0; idx < collection.length; idx++) {
            checkLimits();
            vars[s.item] = collection[idx] as JSONLike;
            trace.push({
              kind: "FOR_ITER",
              info: { item: s.item, index: idx, value: collection[idx] },
            });
            const ret = await runBlock(s.body);
            if (ret !== undefined) {
              if (!hadPrior) delete vars[s.item];
              else vars[s.item] = prior;
              return ret;
            }
          }
          if (!hadPrior) delete vars[s.item];
          else vars[s.item] = prior;
          break;
        }
        case "Return": {
          const val = resolveValue(s.expr);
          trace.push({ kind: "RETURN", info: val });
          return val;
        }
      }
    }
    return undefined;
  };

  try {
    const ret = await runBlock(plan);
    return { ok: true, return: ret, vars, trace };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      vars,
      trace,
    };
  }
}
