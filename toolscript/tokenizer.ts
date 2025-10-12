export type TokType =
  | "LET"
  | "CALL"
  | "IF"
  | "ELSE"
  | "RETURN"
  | "LPAREN"
  | "RPAREN"
  | "LBRACK"
  | "RBRACK"
  | "LBRACE"
  | "RBRACE"
  | "COLON"
  | "ARROW"
  | "EQ"
  | "COMMA"
  | "DQUOTE"
  | "SQUOTE"
  | "NAME"
  | "NUMBER"
  | "TRUE"
  | "FALSE"
  | "NULL"
  | "DQString"
  | "SQString"
  | "BARE"
  | "NEWLINE"
  | "DOLLAR"
  | "AND"
  | "OR"
  | "NOT"
  | "CMP"
  | "EOF";
export interface Token {
  type: TokType;
  text: string;
  line: number;
  col: number;
}
const KEYWORDS: Record<string, TokType> = {
  LET: "LET",
  CALL: "CALL",
  IF: "IF",
  ELSE: "ELSE",
  RETURN: "RETURN",
  AND: "AND",
  OR: "OR",
  NOT: "NOT",
  true: "TRUE",
  false: "FALSE",
  null: "NULL",
};

export function tokenize(input: string): Token[] {
  const toks: Token[] = [];
  let i = 0, line = 1, col = 1;
  const len = input.length;

  const push = (type: TokType, text: string) =>
    toks.push({ type, text, line, col });
  const adv = (n = 1) => {
    while (n--) {
      const ch = input[i++];
      if (ch === "\n") {
        line++;
        col = 1;
      } else col++;
    }
  };

  const isWS = (c: string) => c === " " || c === "\t" || c === "\r";
  const isNameStart = (c: string) => /[A-Za-z_]/.test(c);
  const isName = (c: string) => /[A-Za-z0-9_]/.test(c);

  while (i < len) {
    const c = input[i];

    // whitespace
    if (isWS(c)) {
      adv();
      continue;
    }

    // comments? (optional) - skip // ... endline
    if (c === "/" && input[i + 1] === "/") {
      while (i < len && input[i] !== "\n") adv();
      continue;
    }

    // newline
    if (c === "\n") {
      push("NEWLINE", "\n");
      adv();
      continue;
    }

    // punctuation
    if (c === "(") {
      push("LPAREN", c);
      adv();
      continue;
    }
    if (c === ")") {
      push("RPAREN", c);
      adv();
      continue;
    }
    if (c === "[") {
      push("LBRACK", c);
      adv();
      continue;
    }
    if (c === "]") {
      push("RBRACK", c);
      adv();
      continue;
    }
    if (c === "{") {
      push("LBRACE", c);
      adv();
      continue;
    }
    if (c === "}") {
      push("RBRACE", c);
      adv();
      continue;
    }
    if (c === ":") {
      push("COLON", c);
      adv();
      continue;
    }
    if (c === ",") {
      push("COMMA", c);
      adv();
      continue;
    }
    // comparison ops
    if (c === "!" || c === "<" || c === ">" || c === "=") {
      const two = input.slice(i, i + 2);
      if (two === "==" || two === "!=" || two === "<=" || two === ">=") {
        push("CMP", two);
        adv(2);
        continue;
      }
      if (c === "<" || c === ">") {
        push("CMP", c);
        adv();
        continue;
      }
    }

    if (c === "-") {
      if (input[i + 1] === ">") {
        push("ARROW", "->");
        adv(2);
        continue;
      }
    }
    if (c === "=") {
      if (input[i + 1] === "=" || input[i + 1] === ">") {
        /* handled as CMP/ARROW elsewhere */
      }
      push("EQ", "=");
      adv();
      continue;
    }
    if (c === "$") {
      push("DOLLAR", c);
      adv();
      continue;
    }

    // numbers
    if (/[0-9]/.test(c) || (c === "-" && /[0-9]/.test(input[i + 1] || ""))) {
      let j = i + 1;
      while (j < len && /[0-9_\.]/.test(input[j])) j++;
      const text = input.slice(i, j).replace(/_/g, "");
      push("NUMBER", text);
      adv(j - i);
      continue;
    }

    // strings
    if (c === '"') {
      // double-quoted with escapes
      let j = i + 1;
      let out = "";
      while (j < len) {
        const ch = input[j++];
        if (ch === "\\") {
          const nxt = input[j++];
          out += nxt === "n" ? "\n" : nxt === "t" ? "\t" : nxt;
        } else if (ch === '"') break;
        else out += ch;
      }
      push("DQString", out);
      adv(j - i);
      continue;
    }
    if (c === "'") {
      // single-quoted, allow \' and \\
      let j = i + 1;
      let out = "";
      while (j < len) {
        const ch = input[j++];
        if (ch === "\\") {
          const nxt = input[j++];
          if (nxt === "\n") {
            out += "\n";
          } else if (nxt === "'") {
            out += "'";
          } else if (nxt === "\\") {
            out += "\\";
          } else {
            out += nxt;
          }
        } else if (ch === "'") break;
        else out += ch;
      }
      push("SQString", out);
      adv(j - i);
      continue;
    }

    // names / keywords / barewords
    if (isNameStart(c)) {
      let j = i + 1;
      while (j < len && isName(input[j])) j++;
      const text = input.slice(i, j);
      const kw = KEYWORDS[text as keyof typeof KEYWORDS];
      if (kw) {
        push(kw, text);
      } else {
        push("NAME", text);
      }
      adv(j - i);
      continue;
    }

    // bareword (for args): allow many symbols until whitespace or control chars
    if (/[^\s\[\]\(\)\{\},:=><!\"\'\$]/.test(c)) {
      let j = i + 1;
      while (j < len && /[^\s\[\]\(\)\{\},:=><!\"\'\$]/.test(input[j])) j++;
      const text = input.slice(i, j);
      push("BARE", text);
      adv(j - i);
      continue;
    }

    throw new Error(`Unexpected character '${c}' at ${line}:${col}`);
  }

  push("EOF", "");
  return toks;
}
