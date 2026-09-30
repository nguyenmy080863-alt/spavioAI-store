import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "inventory_manager" | "order_processor";

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  inventory_manager: "Inventory Manager",
  order_processor: "Order Processor",
};

interface AdminAuthValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  isAdmin: boolean;
  canManageProducts: boolean;
  isSuperAdmin: boolean;
  refreshRoles: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthValue | undefined>(undefined);

export const AdminAuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoles = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setRoles([]);
      return;
    }
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    setRoles(((data ?? []) as { role: AppRole }[]).map((r) => r.role));
  }, []);

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      // Defer the role read so we never block the auth callback.
      setTimeout(() => {
        void loadRoles(nextSession?.user?.id).finally(() => setLoading(false));
      }, 0);
    });

    void (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      const { data: userData } = await supabase.auth.getUser();
      setUser(userData.user ?? null);
      await loadRoles(userData.user?.id);
      setLoading(false);
    })();

    return () => subscription.subscription.unsubscribe();
  }, [loadRoles]);

  const refreshRoles = useCallback(async () => {
    await loadRoles(user?.id);
  }, [loadRoles, user?.id]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setRoles([]);
  }, []);

  const value = useMemo<AdminAuthValue>(
    () => ({
      user,
      session,
      roles,
      loading,
      isAdmin: roles.length > 0,
      canManageProducts: roles.includes("super_admin") || roles.includes("inventory_manager"),
      isSuperAdmin: roles.includes("super_admin"),
      refreshRoles,
      signOut,
    }),
    [user, session, roles, loading, refreshRoles, signOut],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
};

export const useAdminAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  return ctx;
};
