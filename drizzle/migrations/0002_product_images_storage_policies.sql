CREATE POLICY "Product images readable"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'product-images');

CREATE POLICY "Managers upload product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images' AND public.can_manage_products(auth.uid()));

CREATE POLICY "Managers update product images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-images' AND public.can_manage_products(auth.uid()));

CREATE POLICY "Managers delete product images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-images' AND public.can_manage_products(auth.uid()));
