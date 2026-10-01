export type DocGroup = "customer" | "admin";

export interface DocEntry {
  group: DocGroup;
  slug: string;
  title: string;
  load: () => Promise<string>;
}

export const DOC_GROUPS: Record<DocGroup, { title: string; description: string }> = {
  customer: { title: "For customers", description: "What shoppers can do and how the flows work." },
  admin: { title: "For admins", description: "How to run the store from the admin panel." },
};

// Markdown lives in /docs; files are loaded on demand.
const files = import.meta.glob("/docs/*/*.md", { query: "?raw", import: "default" }) as Record<
  string,
  () => Promise<string>
>;

const prettify = (name: string) => {
  const text = name.replace(/^\d+-/, "").replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const docs: DocEntry[] = Object.keys(files)
  .sort()
  .flatMap((path) => {
    const match = path.match(/^\/docs\/(customer|admin)\/(.+)\.md$/);
    if (!match) return [];
    const [, group, name] = match;
    return [
      {
        group: group as DocGroup,
        slug: name.replace(/^\d+-/, ""),
        title: prettify(name),
        load: files[path],
      },
    ];
  });

export const docsInGroup = (group: DocGroup) => docs.filter((doc) => doc.group === group);
