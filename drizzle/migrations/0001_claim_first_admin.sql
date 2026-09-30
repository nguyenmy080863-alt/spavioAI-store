CREATE OR REPLACE FUNCTION public.claim_first_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles) THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'super_admin')
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_first_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.claim_first_admin() TO authenticated;
