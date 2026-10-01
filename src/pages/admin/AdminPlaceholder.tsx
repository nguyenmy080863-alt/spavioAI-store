import { useLocation } from "react-router-dom";
import { adminNav, adminSettingsNav } from "@/components/admin/adminNav";

const allItems = [{ title: "Overview", to: "/admin", children: [] }, ...adminNav, adminSettingsNav].flatMap((section) => [
  { title: section.title, to: section.to, parent: undefined as string | undefined },
  ...(section.children ?? []).map((child) => ({ ...child, parent: section.title })),
]);

/** Stand-in page for admin sections that are not built yet. */
const AdminPlaceholder = () => {
  const { pathname } = useLocation();
  const item = allItems.find((entry) => entry.to === pathname.replace(/\/$/, ""));

  return (
    <div>
      {item?.parent && <p className="text-xs text-muted-foreground mb-1">{item.parent}</p>}
      <h1 className="font-heading text-2xl mb-2">{item?.title ?? "Page"}</h1>
      <p className="text-sm text-muted-foreground">This section is coming soon.</p>
    </div>
  );
};

export default AdminPlaceholder;
