import { assert, assertEquals } from "@std/assert";
import { parseToolScript, PlanNode, Stmt } from "./parser.ts";

function isLet(stmt: Stmt): stmt is Extract<Stmt, { kind: "Let" }> {
  return stmt.kind === "Let";
}

function isCall(stmt: Stmt): stmt is Extract<Stmt, { kind: "Call" }> {
  return stmt.kind === "Call";
}

function isReturn(stmt: Stmt): stmt is Extract<Stmt, { kind: "Return" }> {
  return stmt.kind === "Return";
}

Deno.test("parseToolScript builds plan with calls", () => {
  const script = `LET a = 2
LET b = 3
CALL add lhs=$a rhs=$b -> total
RETURN $total
`;

  const result = parseToolScript(script);

  assertEquals(result.requiredCapabilities, ["add", "logger"]);
  assertEquals(result.calledTools, ["add"]);
  assertEquals(result.invocations.length, 1);
  assertEquals(result.invocations[0].capture, "total");

  const plan: PlanNode = result.plan;
  assertEquals(plan.kind, "Script");
  const body: Stmt[] = plan.body;
  assertEquals(body.length, 5);

  assert(isLet(body[0]));
  assertEquals(body[0].name, "a");
  assertEquals(body[0].expr.kind, "Number");

  assert(isLet(body[1]));
  assertEquals(body[1].name, "b");

  assert(isCall(body[2]));
  assertEquals(body[2].call.name, "add");
  assertEquals(Object.keys(body[2].call.args), ["lhs", "rhs"]);

  assert(isReturn(body[4]));
  assertEquals(body[4].expr.kind, "Var");
});
