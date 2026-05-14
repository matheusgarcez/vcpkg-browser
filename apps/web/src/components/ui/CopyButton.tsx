import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";

type CopyButtonProps = {
  text: string;
  className?: string;
};

export function CopyButton({ text, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className={`p-1.5 rounded hover:bg-[var(--color-bg)] transition-colors ${
        className ?? ""
      }`}
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="w-4 h-4 text-[var(--color-accent-green)]" />
      ) : (
        <Copy className="w-4 h-4 text-[var(--color-text-secondary)]" />
      )}
    </button>
  );
}
