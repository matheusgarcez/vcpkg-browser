const SCORE_ROWS = [
  ["active", "75 - 100", "Healthy upstream activity, low lag."],
  ["moderate", "50 - 74", "Maintained, but weaker or slower signals."],
  ["stale", "25 - 49", "Limited recent activity or visible lag."],
  ["inactive", "1 - 24", "Little recent activity."],
  ["archived", "0", "Archived or effectively frozen upstream."],
] as const;

const DATA_ROWS = [
  {
    label: "Current port metadata",
    detail: "Name, version, license, description, dependencies, features, and declared supports expression.",
  },
  {
    label: "Historical versions",
    detail: "Read from the versions database and, when needed, reconstructed from the git tree recorded for that version.",
  },
  {
    label: "Registry timestamps",
    detail: "Prefer when the port changed in vcpkg over when this site last indexed the repository.",
  },
  {
    label: "Upstream repository data",
    detail: "Taken from parsed portfile source declarations first, then narrower URL-based fallbacks when safe.",
  },
  {
    label: "Search index",
    detail: "Indexes stored catalog fields such as names, descriptions, features, dependencies, repository metadata, and registry history.",
  },
] as const;

const DETECTION_ROWS = [
  {
    label: "Strongest signal",
    detail: "Explicit source declarations in `portfile.cmake`, such as `vcpkg_from_github()`, `vcpkg_from_gitlab()`, and exact source URLs.",
  },
  {
    label: "Fallbacks",
    detail: "Provider-specific URL parsing from the port homepage or source URLs when the repository identity is still unambiguous.",
  },
  {
    label: "Excluded on purpose",
    detail: "Generic project sites, documentation pages, and weak guesses that would blur the meaning of upstream repository.",
  },
] as const;

const LIMIT_ROWS = [
  "Declared support is not the same as successful builds on every triplet.",
  "Dependencies come from port metadata, not full build-time resolution.",
  "Upstream activity can lag behind the live repository or release feed.",
  "Some historical ports require legacy CONTROL reconstruction.",
  "Repository detection stays conservative when the source declaration is ambiguous.",
] as const;

export function DataAbout() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <section className="border-b border-[var(--color-border)] pb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
          About the data
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">How this catalog is built</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">
          This site reads the public{" "}
          <a
            href="https://github.com/microsoft/vcpkg"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-primary)] hover:underline"
          >
            microsoft/vcpkg
          </a>{" "}
          registry, stores normalized port metadata, and adds search, history lookups, and upstream heuristics on top.
        </p>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_18rem]">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
          <ReferenceSection
            eyebrow="Catalog"
            title="What is stored"
            note="Search and browse work from the indexed catalog, not by scanning arbitrary files on every request."
          >
            <DefinitionRows rows={DATA_ROWS} />
          </ReferenceSection>

          <ReferenceSection
            eyebrow="Inference"
            title="How upstream links are chosen"
            note="Repository matches stay conservative. If the parser cannot identify a repository confidently, the UI leaves the field empty."
            bordered
          >
            <DefinitionRows rows={DETECTION_ROWS} />
          </ReferenceSection>

          <ReferenceSection
            eyebrow="Heuristic"
            title="Maintenance score"
            note="The score is a summary signal. It helps rank and scan ports, but it is not a build guarantee or package review."
            bordered
          >
            <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]">
                    <th className="px-3 py-2.5 text-left font-medium">Label</th>
                    <th className="px-3 py-2.5 text-left font-medium">Score</th>
                    <th className="px-3 py-2.5 text-left font-medium">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {SCORE_ROWS.map(([label, range, meaning]) => (
                    <tr key={label} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-3 py-2.5 font-medium">{label}</td>
                      <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">{range}</td>
                      <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">{meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ReferenceSection>
        </div>

        <aside className="space-y-5">
          <SidebarSection title="Primary inputs">
            <SidebarList
              items={[
                <InlineLink key="repo" href="https://github.com/microsoft/vcpkg">
                  `ports/` and `versions/` in microsoft/vcpkg
                </InlineLink>,
                "Git history for when versions and registry snapshots changed",
                "Parsed portfiles for source declarations and patch references",
                "Stored upstream metadata when repository detection succeeds",
              ]}
            />
          </SidebarSection>

          <SidebarSection title="Not measured">
            <SidebarList
              items={[
                "Observed build success on every triplet",
                "Runtime quality or security review",
                "Full dependency resolution for every host and target combination",
                "Perfect repository detection for every legacy port",
              ]}
            />
          </SidebarSection>

          <SidebarSection title="Known limits">
            <SidebarList items={[...LIMIT_ROWS]} />
          </SidebarSection>
        </aside>
      </div>
    </div>
  );
}

function ReferenceSection({
  eyebrow,
  title,
  note,
  bordered = false,
  children,
}: {
  eyebrow: string;
  title: string;
  note: string;
  bordered?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={bordered ? "border-t border-[var(--color-border)] px-5 py-5" : "px-5 py-5"}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
        {eyebrow}
      </p>
      <div className="mt-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">{note}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DefinitionRows({
  rows,
}: {
  rows: readonly { label: string; detail: string }[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid gap-2 border-b border-[var(--color-border)] px-3 py-3 last:border-0 md:grid-cols-[11rem_minmax(0,1fr)]"
        >
          <div className="text-sm font-medium">{row.label}</div>
          <div className="text-sm leading-6 text-[var(--color-text-secondary)]">{row.detail}</div>
        </div>
      ))}
    </div>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-3 border-t border-[var(--color-border)] pt-3">{children}</div>
    </section>
  );
}

function SidebarList({ items }: { items: readonly React.ReactNode[] }) {
  return (
    <ul className="space-y-2 text-sm leading-6 text-[var(--color-text-secondary)]">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function InlineLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">
      {children}
    </a>
  );
}
