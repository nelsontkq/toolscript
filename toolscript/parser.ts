import { Token, tokenize, TokType } from "./tokenizer.ts";

export type VarRef = { kind: "Var"; path: (string | number)[] };

export type Value =
  | { kind: "Number"; value: number }
  | { kind: "Bool"; value: boolean }
  | { kind: "Null" }
  | { kind: "String"; value: string }
  | { kind: "Bare"; value: string } // kept as string; you can coerce later if desired
  | { kind: "Array"; items: (Value | VarRef)[] }
  | { kind: "Map"; entries: { key: string; value: Value | VarRef }[] }
  | VarRef;

export type FunctionCall = {
  name: string;
  args: Record<string, Value | VarRef>;
  capture?: string;
  loc?: { line: number; col: number };
};

export type PlanNode = { kind: "Script"; body: Stmt[] } | {
  kind: "Block";
  body: Stmt[];
};

export type Stmt =
  | { kind: "Let"; name: string; expr: Value | VarRef; loc?: SrcLoc }
  | { kind: "Call"; call: FunctionCall }
  | { kind: "If"; cond: Cond; then: PlanNode; else?: PlanNode }
  | { kind: "For"; item: string; iterable: Value | VarRef; body: PlanNode; loc?: SrcLoc }
  | { kind: "Return"; expr: Value | VarRef }
  | { kind: "Empty" };

export type Cond =
  | { kind: "Not"; inner: Cond }
  | { kind: "And"; left: Cond; right: Cond }
  | { kind: "Or"; left: Cond; right: Cond }
  | { kind: "Cmp"; op: CmpOp; left: Value | VarRef; right: Value | VarRef };

export type CmpOp = "==" | "!=" | "<" | "<=" | ">" | ">=";

export type ParseToolscriptResult = {
  requiredCapabilities: string[];
  invocations: FunctionCall[];
  plan: PlanNode;
};

export type SrcLoc = { line: number; col: number };

class Parser {
  private i = 0;
  constructor(private toks: Token[]) {}
  private peek(): Token {
    return this.toks[this.i];
  }
  private next(): Token {
    return this.toks[this.i++];
  }
  private match(type: TokType): Token {
    const t = this.peek();
    if (t.type !== type) {
      throw new Error(`Expected ${type} at ${t.line}:${t.col}, got ${t.type}`);
    }
    return this.next();
  }
  private try(type: TokType): Token | null {
    const t = this.peek();
    if (t.type === type) {
      this.i++;
      return t;
    }
    return null;
  }
  private skipNewlines() {
    while (this.peek().type === "NEWLINE") this.i++;
  }

  parseScript(): ParseToolscriptResult {
    // start: script => declaration stmt*
    const body: Stmt[] = [];
    while (this.peek().type !== "EOF") {
      const s = this.parseStmt();
      if (s) body.push(s);
    }
    const plan: PlanNode = { kind: "Script", body };

    const invocations: FunctionCall[] = [];
    const collect = (n: PlanNode) => {
      const walkStmt = (s: Stmt) => {
        if (s.kind === "Call") {
          invocations.push(s.call);
        } else if (s.kind === "If") {
          collect(s.then);
          if (s.else) {
            collect(s.else);
          }
        } else if (s.kind === "For") {
          collect(s.body);
        }
      };
      if (n.kind === "Script" || n.kind === "Block") {
        n.body.forEach(walkStmt);
      }
    };
    collect(plan);

    return {
      requiredCapabilities: Array.from(new Set(invocations.map((c) => c.name))),
      invocations,
      plan,
    };
  }

  private parseStmt(): Stmt | null {
    this.skipNewlines();
    const t = this.peek();
    switch (t.type) {
      case "LET":
        return this.parseLet();
      case "CALL":
        return this.parseCall();
      case "IF":
        return this.parseIf();
      case "FOR":
        return this.parseFor();
      case "RETURN":
        return this.parseReturn();
      case "NEWLINE":
        this.next();
        return { kind: "Empty" };
      case "EOF":
        return null;
      default:
        throw new Error(`Unexpected token ${t.type} at ${t.line}:${t.col}`);
    }
  }

  private parseLet(): Stmt {
    const kw = this.match("LET");
    const name = this.match("NAME").text;
    this.match("EQ");
    const expr = this.parseExpr();
    this.expectNL();
    return { kind: "Let", name, expr, loc: { line: kw.line, col: kw.col } };
  }

  private parseCall(): Stmt {
    const kw = this.match("CALL");
    const toolTok = this.peek();
    const name = toolTok.type === "NAME" || toolTok.type === "BARE"
      ? this.next().text
      : (() => {
        throw new Error(`Expected tool name at ${toolTok.line}:${toolTok.col}`);
      })();

    const args: Record<string, Value | VarRef> = {};
    while (true) {
      const t = this.peek();
      if (t.type === "NAME") {
        // key=value
        const key = this.next().text;
        this.match("EQ");
        args[key] = this.parseValueOrVar();
        continue;
      }
      break;
    }

    let capture: string | undefined;
    if (this.try("ARROW")) {
      const capTok = this.peek();
      if (capTok.type !== "NAME" && capTok.type !== "BARE") {
        throw new Error(
          `Expected name after -> at ${capTok.line}:${capTok.col}`,
        );
      }
      capture = this.next().text;
    }

    this.expectNL();
    const loc = { line: kw.line, col: kw.col };
    return { kind: "Call", call: { name, args, capture, loc } };
  }

  private parseIf(): Stmt {
    this.match("IF");
    const cond = this.parseCond();
    const then = this.parseBlockAfterColon();
    let els: PlanNode | undefined;
    if (this.try("ELSE")) {
      els = this.parseBlockAfterColon();
    }
    return { kind: "If", cond, then, else: els };
  }

  private parseFor(): Stmt {
    const kw = this.match("FOR");
    const item = this.match("NAME").text;
    this.match("IN");
    const iterable = this.parseValueOrVar();
    const body = this.parseBlockAfterColon();
    return { kind: "For", item, iterable, body, loc: { line: kw.line, col: kw.col } };
  }

  private parseReturn(): Stmt {
    this.match("RETURN");
    const expr = this.parseExpr();
    this.expectNL();
    return { kind: "Return", expr };
  }

  private parseBlock(): PlanNode {
    this.match("LBRACE");
    const body: Stmt[] = [];
    while (true) {
      if (this.peek().type === "RBRACE") break;
      const s = this.parseStmt();
      if (s) body.push(s);
    }
    this.match("RBRACE");
    // optional trailing NL
    if (this.peek().type === "NEWLINE") this.skipNewlines();
    return { kind: "Block", body };
  }

  private parseBlockAfterColon(): PlanNode {
    this.match("COLON");
    this.skipNewlines();
    while (this.peek().type === "COLON") {
      this.next();
      this.skipNewlines();
    }
    return this.parseBlock();
  }

  // --- Expressions & Values ---
  private parseExpr(): Value | VarRef {
    return this.parseValueOrVar();
  }

  private parseValueOrVar(): Value | VarRef {
    const t = this.peek();
    if (t.type === "DOLLAR") return this.parseVarRef();
    return this.parseValue();
  }

  private parseValue(): Value {
    const t = this.peek();
    switch (t.type) {
      case "NUMBER":
        this.next();
        return { kind: "Number", value: Number(t.text) };
      case "TRUE":
        this.next();
        return { kind: "Bool", value: true };
      case "FALSE":
        this.next();
        return { kind: "Bool", value: false };
      case "NULL":
        this.next();
        return { kind: "Null" };
      case "DQString":
        this.next();
        return { kind: "String", value: t.text };
      case "SQString":
        this.next();
        return { kind: "String", value: t.text };
      case "NAME":
        this.next();
        return { kind: "Bare", value: t.text };
      case "BARE":
        this.next();
        return { kind: "Bare", value: t.text };
      case "LBRACK":
        return this.parseArray();
      case "LPAREN":
        return this.parseMap();
      default:
        throw new Error(`Expected value at ${t.line}:${t.col}, got ${t.type}`);
    }
  }

  private parseArray(): Value {
    this.match("LBRACK");
    const items: (Value | VarRef)[] = [];
    while (true) {
      const t = this.peek();
      if (t.type === "RBRACK") break;
      items.push(this.parseValueOrVar());
      // optional separators: comma and/or whitespace are already handled by tokenizer
      if (this.peek().type === "COMMA") this.next();
    }
    this.match("RBRACK");
    return { kind: "Array", items };
  }

  private parseMap(): Value {
    this.match("LPAREN");
    const entries: { key: string; value: Value | VarRef }[] = [];
    while (true) {
      const t = this.peek();
      if (t.type === "RPAREN") break;
      const keyTok = this.match("NAME");
      this.match("EQ");
      const val = this.parseValueOrVar();
      entries.push({ key: keyTok.text, value: val });
    }
    this.match("RPAREN");
    return { kind: "Map", entries };
  }

  private parseVarRef(): VarRef {
    this.match("DOLLAR");
    const path: (string | number)[] = [];
    const first = this.match("NAME").text;
    path.push(first);
    while (this.peek().type === "LBRACK") {
      this.next();
      const n = Number(this.match("NUMBER").text);
      this.match("RBRACK");
      path.push(n);
    }
    return { kind: "Var", path };
  }

  private parseCond(): Cond {
    return this.parseOr();
  }
  private parseOr(): Cond {
    let left = this.parseAnd();
    while (this.peek().type === "OR") {
      this.next();
      const right = this.parseAnd();
      left = { kind: "Or", left, right };
    }
    return left;
  }
  private parseAnd(): Cond {
    let left = this.parseNot();
    while (this.peek().type === "AND") {
      this.next();
      const right = this.parseNot();
      left = { kind: "And", left, right };
    }
    return left;
  }
  private parseNot(): Cond {
    if (this.peek().type === "NOT") {
      this.next();
      return { kind: "Not", inner: this.parseNot() };
    }
    if (this.peek().type === "LPAREN") {
      this.next();
      const c = this.parseCond();
      this.match("RPAREN");
      return c;
    }
    return this.parseCmp();
  }
  private parseCmp(): Cond {
    const left = this.parseValueOrVar();
    const opTok = this.match("CMP");
    const right = this.parseValueOrVar();
    return { kind: "Cmp", op: opTok.text as CmpOp, left, right };
  }

  private expectNL() {
    while (this.peek().type === "NEWLINE") this.next();
    if (this.peek().type === "EOF") return;
  }
}

export function parseToolScript(script: string): ParseToolscriptResult {
  const toks = tokenize(script);
  const p = new Parser(toks);
  return p.parseScript();
}
