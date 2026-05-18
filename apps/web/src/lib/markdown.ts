import { defaultSchema } from "rehype-sanitize";

type PropertyDefinition = NonNullable<NonNullable<typeof defaultSchema.attributes>[string]>[number];

function withExtraAttributes(
  tagName: string,
  attributes: PropertyDefinition[],
): PropertyDefinition[] {
  return [...(defaultSchema.attributes?.[tagName] ?? []), ...attributes];
}

const markdownAttributes: NonNullable<typeof defaultSchema.attributes> = {
  ...defaultSchema.attributes,
  code: withExtraAttributes("code", [["className", /^language-[\w-]+$/]]),
  details: withExtraAttributes("details", ["open"]),
  div: withExtraAttributes("div", ["align"]),
  h1: withExtraAttributes("h1", ["align"]),
  h2: withExtraAttributes("h2", ["align"]),
  h3: withExtraAttributes("h3", ["align"]),
  h4: withExtraAttributes("h4", ["align"]),
  h5: withExtraAttributes("h5", ["align"]),
  h6: withExtraAttributes("h6", ["align"]),
  img: withExtraAttributes("img", ["align", "width", "height"]),
  input: withExtraAttributes("input", [["type", "checkbox"], "checked", "disabled"]),
  li: withExtraAttributes("li", [["className", "task-list-item"]]),
  p: withExtraAttributes("p", ["align"]),
  source: withExtraAttributes("source", ["srcSet", "media", "type"]),
  table: withExtraAttributes("table", ["align"]),
  tbody: withExtraAttributes("tbody", ["align"]),
  td: withExtraAttributes("td", ["align"]),
  th: withExtraAttributes("th", ["align"]),
  thead: withExtraAttributes("thead", ["align"]),
  tr: withExtraAttributes("tr", ["align"]),
  ul: withExtraAttributes("ul", [["className", "contains-task-list"]]),
};

export const markdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "details",
    "summary",
    "picture",
    "source",
    "kbd",
    "sub",
    "sup",
  ],
  attributes: markdownAttributes,
};
