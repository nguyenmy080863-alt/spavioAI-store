-- Staff = any assigned admin-panel role
CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

-- is_admin now means Super Admin only (previously any role)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'::public.app_role
  )
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Profiles: own row, or Super Admin only
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles
FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid()));

-- Draft/archived product visibility stays open to all staff
DROP POLICY IF EXISTS "Admins read all products" ON public.products;
CREATE POLICY "Staff read all products" ON public.products
FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- Audit log: only Super Admins read; any staff member may append their own entries
DROP POLICY IF EXISTS "Admins read audit logs" ON public.audit_logs;
CREATE POLICY "Super admins read audit logs" ON public.audit_logs
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins write audit logs" ON public.audit_logs;
CREATE POLICY "Staff write audit logs" ON public.audit_logs
FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) AND actor_id = auth.uid());

REVOKE ALL ON FUNCTION public.is_staff(UUID) FROM public, anon;
REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM public, anon;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM public, anon;
REVOKE ALL ON FUNCTION public.can_manage_products(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_products(UUID) TO authenticated;
