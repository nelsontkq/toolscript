import { assert, assertEquals } from "@std/assert";
import {
  Capabilities,
  inspectToolScript,
  prepareToolScript,
  runToolScript,
  ExecutionResult,
} from "./main.ts";

const sampleScript = `CALL fetch_order id=42 -> status
IF $status == "pending": {
  CALL update_order id=42 amount=33 -> updated
  RETURN $updated
}
RETURN $status
`;

Deno.test("inspectToolScript reports capabilities and plan", () => {
  const analysis = inspectToolScript(sampleScript);
  assertEquals(analysis.requiredCapabilities, [
    "fetch_order",
    "update_order",
  ]);
  assertEquals(analysis.invocations.length, 2);
  assertEquals(analysis.plan.kind, "Script");
});

Deno.test("prepareToolScript defers execution until tools provided", async () => {
  const prepared = prepareToolScript(sampleScript);
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];

  const tools: Capabilities = {
    fetch_order: () => "pending",
    update_order: (args) => {
      calls.push({ name: "update_order", args: args as Record<string, unknown> });
      return { ok: true };
    },
  };

  const result = await prepared.execute(tools);
  assert(result.ok);
  assertEquals(result.return, { ok: true });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].args.amount, 33);
});

Deno.test("runToolScript executes toolscript string directly", async () => {
  const tools: Capabilities = {
    fetch_order: () => "complete",
    update_order: () => {
      throw new Error("should not run");
    },
  };

  const result: ExecutionResult = await runToolScript(sampleScript, tools);
  assert(result.ok);
  assertEquals(result.return, "complete");
});
