export function parseUsage(usageContent: string): string {
  const lines = usageContent.split("\n").map((l) => l.trim());
  const textParts: string[] = [];

  for (const line of lines) {
    if (line.startsWith("#") || line.startsWith("//")) continue;
    if (line.length === 0) continue;
    textParts.push(line);
  }

  return textParts.join("\n");
}
