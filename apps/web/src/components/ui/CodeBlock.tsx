import { CopyButton } from "./CopyButton";

type CodeBlockProps = {
  code: string;
  language?: string;
  maxHeight?: string;
};

export function CodeBlock({ code, language, maxHeight = "400px" }: CodeBlockProps) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-2">
        {language ? (
          <span className="text-xs text-[var(--color-text-secondary)]">{language}</span>
        ) : (
          <span />
        )}
        <CopyButton text={code} />
      </div>
      <pre
        className="m-0 overflow-auto bg-[var(--color-code-bg)] p-4"
        style={{ maxHeight }}
      >
        <code className="text-sm font-mono text-[var(--color-text)] whitespace-pre">
          {code}
        </code>
      </pre>
    </div>
  );
}
