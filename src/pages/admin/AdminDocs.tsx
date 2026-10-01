import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { DOC_GROUPS, docs, docsInGroup, type DocGroup } from "@/lib/docs";

const isGroup = (value: string | undefined): value is DocGroup =>
  value === "customer" || value === "admin";

const DocsIndex = () => (
  <div className="space-y-10">
    <div>
      <h1 className="text-xl font-light text-foreground">Docs</h1>
      <p className="text-sm text-muted-foreground mt-1">Flows and features of the store.</p>
    </div>
    {(Object.keys(DOC_GROUPS) as DocGroup[]).map((group) => (
      <section key={group}>
        <Link to={`/admin/docs/${group}`} className="text-sm text-foreground">
          {DOC_GROUPS[group].title}
        </Link>
        <p className="text-xs text-muted-foreground mb-3">{DOC_GROUPS[group].description}</p>
        <ul className="space-y-1">
          {docsInGroup(group).map((doc) => (
            <li key={doc.slug}>
              <Link
                to={`/admin/docs/${group}/${doc.slug}`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {doc.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    ))}
  </div>
);

const DocGroupPage = ({ group }: { group: DocGroup }) => (
  <div className="space-y-6">
    <div>
      <p className="text-xs text-muted-foreground mb-1">
        <Link to="/admin/docs">Docs</Link>
      </p>
      <h1 className="text-xl font-light text-foreground">{DOC_GROUPS[group].title}</h1>
      <p className="text-sm text-muted-foreground mt-1">{DOC_GROUPS[group].description}</p>
    </div>
    <ul className="border border-border divide-y divide-border">
      {docsInGroup(group).map((doc) => (
        <li key={doc.slug}>
          <Link
            to={`/admin/docs/${group}/${doc.slug}`}
            className="block px-4 py-3 text-sm text-foreground hover:bg-muted"
          >
            {doc.title}
          </Link>
        </li>
      ))}
    </ul>
  </div>
);

const DocPage = ({ group, slug }: { group: DocGroup; slug: string }) => {
  const doc = docs.find((entry) => entry.group === group && entry.slug === slug);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-doc", group, slug],
    queryFn: () => doc!.load(),
    enabled: Boolean(doc),
  });

  if (!doc) return <Navigate to={`/admin/docs/${group}`} replace />;

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-4">
        <Link to="/admin/docs">Docs</Link> /{" "}
        <Link to={`/admin/docs/${group}`}>{DOC_GROUPS[group].title}</Link>
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-heading prose-headings:font-light prose-table:text-sm">
          <ReactMarkdown>{data ?? ""}</ReactMarkdown>
        </article>
      )}
    </div>
  );
};

/** Renders /admin/docs, /admin/docs/:group and /admin/docs/:group/:slug. */
const AdminDocs = () => {
  const { group, slug } = useParams();
  if (!group) return <DocsIndex />;
  if (!isGroup(group)) return <Navigate to="/admin/docs" replace />;
  return slug ? <DocPage group={group} slug={slug} /> : <DocGroupPage group={group} />;
};

export default AdminDocs;
