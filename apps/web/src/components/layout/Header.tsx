import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router";
import { Box, Star, Monitor, History, Info, Moon, Sun, ChevronDown } from "lucide-react";
import { SearchBar } from "../search/SearchBar";
import { useTheme } from "../theme/ThemeProvider";

const BROWSE_LINKS = [
  { to: "/ports", label: "All ports", icon: Box },
  { to: "/ports/popular", label: "Popular", icon: Star },
  { to: "/ports/recently-added", label: "Recently added", icon: Star },
  { to: "/ports/recently-updated", label: "Recently updated", icon: History },
  { to: "/triplets", label: "Triplets", icon: Monitor },
  { to: "/releases", label: "Releases", icon: History },
  { to: "/about/data", label: "About", icon: Info },
];

export function Header() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const { theme, toggleTheme } = useTheme();
  const [browseOpen, setBrowseOpen] = useState(false);

  function handleSearch(query: string) {
    navigate(`/ports?q=${encodeURIComponent(query)}`);
  }

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-5 px-6">
        <Link to="/" className="shrink-0 text-lg font-semibold tracking-tight">
          vcpkg browse
        </Link>
        <div className="min-w-0 flex-1 max-w-3xl">
          <SearchBar value={q} onSearch={handleSearch} autoSearch debounceMs={400} />
        </div>
        <nav className="flex items-center gap-2">
          <Popover.Root open={browseOpen} onOpenChange={setBrowseOpen}>
            <Popover.Trigger asChild>
              <button
                type="button"
                aria-label="Open browse menu"
                className="inline-flex h-9 items-center gap-2 rounded-md px-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)]"
              >
                <Box className="h-4 w-4 text-[var(--color-text-secondary)]" />
                <span>Browse</span>
                <ChevronDown className="h-4 w-4 text-[var(--color-text-secondary)]" />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                sideOffset={12}
                align="end"
                className="z-50 w-[14rem] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-[var(--shadow-lg)]"
              >
                <div className="space-y-0.5">
                  {BROWSE_LINKS.map(({ to, label, icon: Icon }) => (
                    <Popover.Close key={to} asChild>
                      <Link
                        to={to}
                        className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-[var(--color-surface-muted)]"
                      >
                        <div className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-sm text-[var(--color-text-secondary)]">
                          <Icon className="h-3.5 w-3.5 text-[var(--color-text-secondary)]" />
                        </div>
                        <div className="min-w-0 text-sm font-medium text-[var(--color-text)]">{label}</div>
                      </Link>
                    </Popover.Close>
                  ))}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </nav>
      </div>
    </header>
  );
}
