import { inspect } from "node:util";

export type PrettyLogLevel = "debug" | "info" | "warn" | "error";

type PrettyLogFields = Record<string, unknown>;

type PrettyLogger = {
  debug: (message: string, fields?: PrettyLogFields) => void;
  info: (message: string, fields?: PrettyLogFields) => void;
  warn: (message: string, fields?: PrettyLogFields) => void;
  error: (message: string, fields?: PrettyLogFields) => void;
};

type ConsoleState = {
  installed: boolean;
  name: string;
};

const PRETTY_CONSOLE_STATE_KEY = Symbol.for("vcpkg-browser.pretty-console-state");

function pad(value: number, width = 2): string {
  return value.toString().padStart(width, "0");
}

function formatTimestamp(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function formatError(error: Error & { code?: string }): string {
  const code = error.code ? ` code=${error.code}` : "";
  return `${error.name}: ${error.message}${code}`;
}

function formatValue(value: unknown): string {
  if (value instanceof Error) {
    return JSON.stringify(formatError(value));
  }

  if (typeof value === "string") {
    return /[\s="]/.test(value) ? JSON.stringify(value) : value;
  }

  if (typeof value === "number" || typeof value === "boolean" || value == null) {
    return String(value);
  }

  return inspect(value, {
    depth: 4,
    compact: true,
    breakLength: Number.POSITIVE_INFINITY,
    maxArrayLength: 20,
    sorted: true,
    colors: false,
  });
}

function formatFields(fields?: PrettyLogFields): string {
  if (!fields) {
    return "";
  }

  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return "";
  }

  return entries.map(([key, value]) => `${key}=${formatValue(value)}`).join(" ");
}

export function formatPrettyLogLine(args: {
  level: PrettyLogLevel;
  name: string;
  message: string;
  fields?: PrettyLogFields;
  now?: Date;
}): string {
  const prefix = `${formatTimestamp(args.now)} ${args.level.toUpperCase()} [${args.name}] ${args.message}`;
  const suffix = formatFields(args.fields);
  return suffix ? `${prefix} ${suffix}` : prefix;
}

function writeLog(level: PrettyLogLevel, name: string, message: string, fields?: PrettyLogFields) {
  const line = formatPrettyLogLine({ level, name, message, fields });
  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

export function createPrettyLogger(name: string): PrettyLogger {
  return {
    debug(message, fields) {
      writeLog("debug", name, message, fields);
    },
    info(message, fields) {
      writeLog("info", name, message, fields);
    },
    warn(message, fields) {
      writeLog("warn", name, message, fields);
    },
    error(message, fields) {
      writeLog("error", name, message, fields);
    },
  };
}

function formatConsoleArgs(args: unknown[]): string {
  if (args.length === 0) {
    return "";
  }

  if (typeof args[0] === "string") {
    const [message, ...rest] = args;
    if (rest.length === 0) {
      return message;
    }
    return `${message} ${rest.map((value) => formatValue(value)).join(" ")}`;
  }

  return args.map((value) => formatValue(value)).join(" ");
}

export function installPrettyConsole(args: {
  name: string;
  enabled: boolean;
}) {
  if (!args.enabled) {
    return;
  }

  const globalState = globalThis as typeof globalThis & {
    [PRETTY_CONSOLE_STATE_KEY]?: ConsoleState;
  };

  if (globalState[PRETTY_CONSOLE_STATE_KEY]?.installed) {
    return;
  }

  const logger = createPrettyLogger(args.name);

  console.log = (...values: unknown[]) => {
    logger.info(formatConsoleArgs(values));
  };
  console.info = (...values: unknown[]) => {
    logger.info(formatConsoleArgs(values));
  };
  console.warn = (...values: unknown[]) => {
    logger.warn(formatConsoleArgs(values));
  };
  console.error = (...values: unknown[]) => {
    logger.error(formatConsoleArgs(values));
  };
  console.debug = (...values: unknown[]) => {
    logger.debug(formatConsoleArgs(values));
  };

  globalState[PRETTY_CONSOLE_STATE_KEY] = {
    installed: true,
    name: args.name,
  };
}
