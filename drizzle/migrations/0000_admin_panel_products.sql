-- Roles
CREATE TYPE public.app_role AS ENUM ('super_admin', 'inventory_manager', 'order_processor');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.can_manage_products(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin', 'inventory_manager')
  )
$$;

-- Profile auto-creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "Users read own profile" ON public.profiles
FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Users update own profile" ON public.profiles
FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE POLICY "Users read own roles" ON public.user_roles
FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

-- Categories
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories are public" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Managers write categories" ON public.categories
FOR ALL TO authenticated USING (public.can_manage_products(auth.uid())) WITH CHECK (public.can_manage_products(auth.uid()));

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  effect TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  editors_notes TEXT NOT NULL DEFAULT '',
  price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  sale_price NUMERIC(10,2) CHECK (sale_price IS NULL OR sale_price >= 0),
  stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
  low_stock_threshold INT NOT NULL DEFAULT 5,
  is_new BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  archived_at TIMESTAMPTZ,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published products are public" ON public.products
FOR SELECT USING (status = 'published' AND archived_at IS NULL);
CREATE POLICY "Admins read all products" ON public.products
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Managers write products" ON public.products
FOR ALL TO authenticated USING (public.can_manage_products(auth.uid())) WITH CHECK (public.can_manage_products(auth.uid()));

CREATE TABLE public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url TEXT,
  asset_key TEXT,
  storage_path TEXT,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX product_images_product_idx ON public.product_images(product_id);
GRANT SELECT ON public.product_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_images TO authenticated;
GRANT ALL ON public.product_images TO service_role;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Product images are public" ON public.product_images FOR SELECT USING (true);
CREATE POLICY "Managers write product images" ON public.product_images
FOR ALL TO authenticated USING (public.can_manage_products(auth.uid())) WITH CHECK (public.can_manage_products(auth.uid()));

-- Audit log
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON public.audit_logs(created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit logs" ON public.audit_logs
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins write audit logs" ON public.audit_logs
FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()) AND actor_id = auth.uid());

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER products_touch_updated_at BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
