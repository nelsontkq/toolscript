import { assert, assertEquals } from "@std/assert";
import { parseToolScript, Stmt } from "./parser.ts";

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

  assertEquals(result.requiredCapabilities, ["add"]);
  assertEquals(result.invocations.length, 1);
  assertEquals(result.invocations[0].capture, "total");

  assertEquals(result.plan.kind, "Script");
  const body = result.plan.body;
  assertEquals(body.length, 4);

  if (!isLet(body[0])) {
    throw new Error("Expected first statement to be a Let");
  }
  assertEquals(body[0].name, "a");
  assertEquals(body[0].expr.kind, "Number");

  assert(isLet(body[1]));
  assertEquals(body[1].name, "b");

  assert(isCall(body[2]));
  assertEquals(body[2].call.name, "add");
  assertEquals(Object.keys(body[2].call.args), ["lhs", "rhs"]);

  assert(isReturn(body[3]));
  assertEquals(body[3].expr.kind, "Var");
});

Deno.test("parseToolScript parses FOR loops", () => {
  const script = `CALL fetch -> rows
FOR row IN $rows: {
  CALL handle value=$row -> last
}
RETURN $last
`;

  const result = parseToolScript(script);
  const body = result.plan.body;

  assertEquals(body.length, 3);
  assert(isCall(body[0]));
  assertEquals(body[0].call.name, "fetch");

  const loopStmt = body[1];
  assertEquals(loopStmt.kind, "For");
  if (loopStmt.kind !== "For") return;
  assertEquals(loopStmt.item, "row");
  assertEquals(loopStmt.body.kind, "Block");
  assertEquals(loopStmt.body.body.length, 1);
  const inner = loopStmt.body.body[0];
  assert(isCall(inner));
  assertEquals(inner.call.args.value?.kind, "Var");

  assert(isReturn(body[2]));
});

Deno.test("parseToolScript tolerates extra colon before block braces", () => {
  const script = `IF $rows != null:: {
  CALL noop value=$rows
}
`;

  const result = parseToolScript(script);
  const body = result.plan.body;
  assertEquals(body.length, 1);
  const ifStmt = body[0];
  assertEquals(ifStmt.kind, "If");
  if (ifStmt.kind !== "If") return;
  assertEquals(ifStmt.then.kind, "Block");
  assertEquals(ifStmt.then.body.length, 1);
});
