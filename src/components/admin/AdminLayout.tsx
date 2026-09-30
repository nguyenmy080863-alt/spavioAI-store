import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAdminAuth, ROLE_LABELS } from "@/context/AdminAuthContext";
import { Button } from "@/components/ui/button";
import StoreLogo from "@/components/StoreLogo";

const links = [
  { to: "/admin", label: "Overview", end: true },
  { to: "/admin/products", label: "Products", end: false },
  { to: "/admin/hero", label: "Hero banner", end: false },
  { to: "/admin/fomo", label: "Spavio AI Flash Sale", end: false },
  { to: "/admin/team", label: "Team & roles", end: false },
  { to: "/admin/audit-log", label: "Audit log", end: false },
];

const AdminLayout = () => {
  const { user, isAdmin, loading, roles, signOut } = useAdminAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          This account ({user.email}) has no admin role yet.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link to="/">Back to shop</Link>
          </Button>
          <Button size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-6 h-16 border-b border-border">
        <div className="flex items-center gap-8">
          <Link to="/">
            <StoreLogo heightClass="h-6" />
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `text-sm font-light transition-colors ${
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:block text-right">
            <p className="text-xs text-foreground">{user.email}</p>
            <p className="text-[0.65rem] text-muted-foreground">
              {roles.map((role) => ROLE_LABELS[role]).join(" · ")}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </header>

      <nav className="md:hidden flex gap-4 px-6 py-3 border-b border-border overflow-x-auto">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              `text-xs whitespace-nowrap font-light ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      <main className="px-6 py-10 max-w-6xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
