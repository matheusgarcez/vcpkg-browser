const SUPPORTED_TRIPLETS = [
  "x64-windows",
  "x86-windows",
  "arm64-windows",
  "x64-windows-static",
  "x86-windows-static",
  "arm64-windows-static",
  "x64-windows-static-md",
  "x86-windows-static-md",
  "arm64-windows-static-md",
  "x64-uwp",
  "x86-uwp",
  "arm64-uwp",
  "x64-linux",
  "x86-linux",
  "arm64-linux",
  "arm-linux",
  "x64-osx",
  "arm64-osx",
  "x64-android",
  "arm64-android",
  "x86-android",
  "arm-neon-android",
  "wasm32-emscripten",
  "x64-freebsd",
  "x64-openbsd",
];

type TokenType = "ident" | "and" | "or" | "not" | "lparen" | "rparen" | "eof";

type Token = {
  type: TokenType;
  value?: string;
};

const KNOWN_FACTS = new Set([
  "x64",
  "x86",
  "arm64",
  "arm",
  "wasm32",
  "windows",
  "linux",
  "osx",
  "android",
  "freebsd",
  "openbsd",
  "emscripten",
  "uwp",
  "static",
]);

function getTripletFacts(arch: string, os: string): Record<string, boolean> {
  return {
    x64: arch === "x64",
    x86: arch === "x86",
    arm64: arch === "arm64",
    arm: arch === "arm",
    wasm32: arch === "wasm32",
    windows: os === "windows" || os.startsWith("windows") || os.startsWith("uwp"),
    linux: os === "linux",
    osx: os === "osx",
    android: os.startsWith("android"),
    freebsd: os === "freebsd",
    openbsd: os === "openbsd",
    emscripten: os === "emscripten",
    uwp: os.startsWith("uwp"),
    static: os.includes("static"),
  };
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const c = expr[i];

    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    if (c === "!") {
      tokens.push({ type: "not" });
      i++;
      continue;
    }
    if (c === "&") {
      tokens.push({ type: "and" });
      i++;
      continue;
    }
    if (c === "|") {
      tokens.push({ type: "or" });
      i++;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let ident = "";
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        ident += expr[i++];
      }
      tokens.push({ type: "ident", value: ident });
      continue;
    }
    i++;
  }

  tokens.push({ type: "eof" });
  return tokens;
}

class Parser {
  private tokens: Token[];
  private pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  evaluate(facts: Record<string, boolean>): boolean {
    const result = this.parseExpr(facts);
    if (this.peek().type !== "eof") {
      throw new Error("Unexpected token after expression");
    }
    return result;
  }

  private parseExpr(facts: Record<string, boolean>): boolean {
    let left = this.parseTerm(facts);
    while (this.peek().type === "or") {
      this.consume();
      const right = this.parseTerm(facts);
      left = left || right;
    }
    return left;
  }

  private parseTerm(facts: Record<string, boolean>): boolean {
    let left = this.parseFactor(facts);
    while (this.peek().type === "and") {
      this.consume();
      const right = this.parseFactor(facts);
      left = left && right;
    }
    return left;
  }

  private parseFactor(facts: Record<string, boolean>): boolean {
    if (this.peek().type === "not") {
      this.consume();
      return !this.parseFactor(facts);
    }
    return this.parsePrimary(facts);
  }

  private parsePrimary(facts: Record<string, boolean>): boolean {
    const token = this.peek();
    if (token.type === "ident") {
      this.consume();
      if (!(token.value! in facts)) {
        throw new Error("Unknown identifier: " + token.value);
      }
      return facts[token.value!];
    }
    if (token.type === "lparen") {
      this.consume();
      const result = this.parseExpr(facts);
      if (this.peek().type !== "rparen") {
        throw new Error("Expected closing parenthesis");
      }
      this.consume();
      return result;
    }
    throw new Error("Unexpected token: " + JSON.stringify(token));
  }
}

export function evaluateSupports(expression: string | undefined | null): string[] {
  if (!expression || expression.trim() === "") {
    return [...SUPPORTED_TRIPLETS];
  }

  const normalized = expression
    .replace(/\bnot\b/gi, "!")
    .replace(/\band\b/gi, "&")
    .replace(/\bor\b/gi, "|");

  let tokens: Token[];
  try {
    tokens = tokenize(normalized);
  } catch {
    return [...SUPPORTED_TRIPLETS];
  }

  const hasUnknownIdent = tokens.some(
    (t) => t.type === "ident" && !KNOWN_FACTS.has(t.value!)
  );
  if (hasUnknownIdent) {
    return [...SUPPORTED_TRIPLETS];
  }

  return SUPPORTED_TRIPLETS.filter((triplet) => {
    const [arch, ...osParts] = triplet.split("-");
    const os = osParts.join("-");
    const facts = getTripletFacts(arch, os);

    try {
      const parser = new Parser([...tokens]);
      return parser.evaluate(facts);
    } catch {
      return true;
    }
  });
}

// Tests:
// evaluateSupports(undefined) => all triplets
// evaluateSupports("!uwp") => excludes uwp triplets
// evaluateSupports("windows & !uwp") => includes windows but not uwp
// evaluateSupports("linux | osx") => includes linux and osx
