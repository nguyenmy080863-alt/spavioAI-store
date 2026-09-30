CREATE TABLE public.saved_carts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_carts TO authenticated;
GRANT ALL ON public.saved_carts TO service_role;

ALTER TABLE public.saved_carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own cart" ON public.saved_carts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own cart" ON public.saved_carts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own cart" ON public.saved_carts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own cart" ON public.saved_carts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);