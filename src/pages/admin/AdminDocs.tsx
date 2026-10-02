import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { docKey, docPath, docs, findDoc, readingOrder, resolvedSections, type DocEntry } from "@/lib/docs";

/** Loads every page once so the search can look inside the text. */
const useAllDocText = (enabled: boolean) =>
  useQuery({
    queryKey: ["admin-doc-all"],
    queryFn: async () =>
      Object.fromEntries(await Promise.all(docs.map(async (doc) => [docKey(doc), await doc.load()]))) as Record<
        string,
        string
      >,
    enabled,
    staleTime: Infinity,
  });

const Sidebar = ({ query, setQuery }: { query: string; setQuery: (value: string) => void }) => {
  const sections = useMemo(resolvedSections, []);
  const searching = query.trim().length > 1;
  const { data: text } = useAllDocText(searching);
  const needle = query.trim().toLowerCase();

  const matches = (doc: DocEntry) =>
    doc.title.toLowerCase().includes(needle) || (text?.[docKey(doc)] ?? "").toLowerCase().includes(needle);

  return (
    <aside className="lg:w-64 shrink-0 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      <div className="relative mb-4">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the docs…"
          className="pl-9"
        />
      </div>
      <nav className="space-y-5">
        {sections.map((section, index) => {
          const entries = searching ? section.entries.filter(matches) : section.entries;
          if (entries.length === 0) return null;
          return (
            <div key={section.title}>
              <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1.5">
                {index + 1} · {section.title}
              </p>
              <ul>
                {entries.map((doc) => (
                  <li key={docKey(doc)}>
                    <NavLink
                      to={docPath(doc)}
                      className={({ isActive }) =>
                        `block py-1 text-sm ${
                          isActive ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
                        }`
                      }
                    >
                      {doc.title}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {searching && text && !docs.some(matches) && (
          <p className="text-sm text-muted-foreground">Nothing found for "{query}".</p>
        )}
      </nav>
    </aside>
  );
};

const DocsHome = () => {
  const sections = useMemo(resolvedSections, []);
  const first = readingOrder()[0];
  return (
    <div className="space-y-12">
      <header className="space-y-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Documentation</p>
        <h1 className="text-3xl md:text-4xl font-light text-foreground">
          How the store works — <span className="italic font-heading">written down.</span>
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
          Every flow and feature of the admin panel and the shop, section by section. Start with the basics, or jump
          straight to the part you need. Features that are not connected yet are marked as such in their page.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          {first && (
            <Link
              to={docPath(first)}
              className="inline-flex items-center gap-2 bg-foreground text-background px-5 h-10 text-sm"
            >
              Start reading <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          <Link
            to="/admin/docs/testing/test-plan"
            className="inline-flex items-center border border-border px-5 h-10 text-sm hover:bg-muted"
          >
            Test plan
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-3 border border-border divide-x divide-border">
        {[
          [sections.length, "Sections"],
          [docs.length, "Pages"],
          [docs.filter((doc) => doc.group === "customer").length, "Customer guides"],
        ].map(([value, label]) => (
          <div key={label} className="p-5">
            <p className="text-2xl font-light text-foreground">{value}</p>
            <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      <section className="space-y-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Sections</p>
        <div className="grid gap-4 md:grid-cols-2">
          {sections.map((section, index) => (
            <div key={section.title} className="border border-border p-5">
              <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Section {index + 1}</p>
              <h2 className="text-base text-foreground mt-1">{section.title}</h2>
              <p className="text-xs text-muted-foreground mt-1 mb-3">{section.description}</p>
              <ul className="space-y-1">
                {section.entries.map((doc) => (
                  <li key={docKey(doc)}>
                    <Link to={docPath(doc)} className="text-sm text-muted-foreground hover:text-foreground">
                      {doc.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

const DocPage = ({ doc }: { doc: DocEntry }) => {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-doc", doc.group, doc.slug],
    queryFn: () => doc.load(),
  });
  const order = useMemo(readingOrder, []);
  const index = order.findIndex((entry) => docKey(entry) === docKey(doc));
  const section = useMemo(
    () => resolvedSections().find((item) => item.entries.some((entry) => docKey(entry) === docKey(doc))),
    [doc],
  );
  const prev = index > 0 ? order[index - 1] : undefined;
  const next = index >= 0 && index < order.length - 1 ? order[index + 1] : undefined;

  useEffect(() => window.scrollTo({ top: 0 }), [doc]);

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-4">
        <Link to="/admin/docs">Docs</Link>
        {section && <> / {section.title}</>}
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-heading prose-headings:font-light prose-table:text-sm">
          <ReactMarkdown>{data ?? ""}</ReactMarkdown>
        </article>
      )}
      <div className="grid grid-cols-2 gap-4 mt-12 pt-6 border-t border-border">
        {prev ? (
          <Link to={docPath(prev)} className="border border-border p-4 hover:bg-muted">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowLeft className="h-3 w-3" /> Previous
            </span>
            <span className="text-sm text-foreground">{prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={docPath(next)} className="border border-border p-4 hover:bg-muted text-right">
            <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
              Next <ArrowRight className="h-3 w-3" />
            </span>
            <span className="text-sm text-foreground">{next.title}</span>
          </Link>
        )}
      </div>
    </div>
  );
};

/** Renders /admin/docs, /admin/docs/:group and /admin/docs/:group/:slug. */
const AdminDocs = () => {
  const { group, slug } = useParams();
  const [query, setQuery] = useState("");
  const doc = group && slug ? findDoc(group, slug) : undefined;

  if (group && slug && !doc) return <Navigate to="/admin/docs" replace />;
  if (group && !slug) {
    const first = docs.find((entry) => entry.group === group);
    return <Navigate to={first ? docPath(first) : "/admin/docs"} replace />;
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      <Sidebar query={query} setQuery={setQuery} />
      <div className="flex-1 min-w-0 max-w-3xl">{doc ? <DocPage doc={doc} /> : <DocsHome />}</div>
    </div>
  );
};

export default AdminDocs;
