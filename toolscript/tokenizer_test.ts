import { assert, assertEquals } from "@std/assert";
import { tokenize } from "./tokenizer.ts";

Deno.test("tokenize parses keywords, numbers, and strings", () => {
  const script = `CALL calc amount=1_000 note="line\\n" flag=true
`;

  const tokens = tokenize(script);
  const types = tokens.map((t) => t.type);

  assertEquals(types, [
    "CALL",
    "NAME",
    "NAME",
    "EQ",
    "NUMBER",
    "NAME",
    "EQ",
    "DQString",
    "NAME",
    "EQ",
    "TRUE",
    "NEWLINE",
    "EOF",
  ]);

  const numberToken = tokens.find((t) => t.type === "NUMBER");
  assert(numberToken);
  assertEquals(numberToken?.text, "1000");

  const stringToken = tokens.find((t) => t.type === "DQString");
  assert(stringToken);
  assertEquals(stringToken?.text, "line\n");

  const trueToken = tokens.find((t) => t.type === "TRUE");
  assert(trueToken);

  const eof = tokens.at(-1);
  assertEquals(eof?.type, "EOF");
});
