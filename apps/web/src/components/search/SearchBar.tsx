import { useEffect, useEffectEvent, useState, type FormEvent } from "react";
import { Search } from "lucide-react";

type SearchBarProps = {
  value?: string;
  onSearch: (query: string) => void;
  autoSearch?: boolean;
  debounceMs?: number;
  size?: "default" | "large";
};

export function SearchBar({
  value = "",
  onSearch,
  autoSearch = true,
  debounceMs = 100,
  size = "default",
}: SearchBarProps) {
  const [input, setInput] = useState(value);
  const runSearch = useEffectEvent((query: string) => {
    onSearch(query);
  });

  useEffect(() => {
    setInput(value);
  }, [value]);

  useEffect(() => {
    if (!autoSearch || input === value) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      runSearch(input);
    }, debounceMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autoSearch, debounceMs, input, runSearch, value]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    runSearch(input);
  }

  const large = size === "large";

  return (
    <form onSubmit={handleSubmit} className="relative">
      <Search
        className={`absolute top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] ${
          large ? "left-4 h-4.5 w-4.5" : "left-3 h-4 w-4"
        }`}
      />
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Search ports... (e.g., ffmpeg, repository:github, license:mit)"
        className={`w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)] placeholder:text-[var(--color-text-secondary)] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${
          large ? "py-3 pr-5 pl-11 text-[15px]" : "py-2.5 pr-4 pl-10 text-sm"
        }`}
      />
    </form>
  );
}
