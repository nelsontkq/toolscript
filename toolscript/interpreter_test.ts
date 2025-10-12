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
