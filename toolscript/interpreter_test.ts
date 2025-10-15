import { assert, assertEquals } from "@std/assert";
import { parseToolScript } from "./parser.ts";
import { type Capabilities, executeToolScript } from "./interpreter.ts";

Deno.test("executeToolScript runs return path for simple plan", async () => {
  const script = `LET a = 2
LET b = 3
CALL add lhs=$a rhs=$b -> total
RETURN $total
`;

  const { plan } = parseToolScript(script);
  assertEquals(plan.kind, "Script");

  const tools: Capabilities = {
    add: (args) => {
      const record = args as Record<string, unknown>;
      const lhs = Number(record.lhs);
      const rhs = Number(record.rhs);
      return lhs + rhs;
    },
  };

  const result = await executeToolScript(plan, tools);

  assert(result.ok);
  assertEquals(result.return, 5);
  assertEquals(result.vars.total, 5);
  assertEquals(result.trace.some((entry) => entry.kind === "CALL"), true);
});

Deno.test("executeToolScript resolves bare identifiers to variables when available", async () => {
  const script = `CALL getSaved -> saved
RETURN (saved=saved missing=missing status=active)
`;

  const { plan } = parseToolScript(script);
  const tools: Capabilities = {
    getSaved: () => ({ ok: true }),
  };

  const result = await executeToolScript(plan, tools);

  assert(result.ok);
  assert(result.return);
  const returned = result.return as Record<string, unknown>;
  assertEquals(returned.saved, { ok: true });
  assertEquals(returned.missing, "missing");
  assertEquals(returned.status, "active");
});

Deno.test("executeToolScript iterates FOR loops over arrays", async () => {
  const script = `CALL listNumbers -> nums
FOR num IN $nums: {
  CALL accumulate value=$num -> latest
}
RETURN $latest
`;

  const { plan } = parseToolScript(script);
  const seen: unknown[] = [];
  const tools: Capabilities = {
    listNumbers: () => [1, 2, 3],
    accumulate: (args) => {
      const value = (args as Record<string, number>).value;
      seen.push(value);
      return value;
    },
  };

  const result = await executeToolScript(plan, tools);

  assert(result.ok);
  assert(result.return);
  assertEquals(result.return, 3);
  assertEquals(seen, [1, 2, 3]);
  const loopEntries = result.trace.filter((entry) => entry.kind === "FOR_ITER");
  assertEquals(loopEntries.length, 3);
});
