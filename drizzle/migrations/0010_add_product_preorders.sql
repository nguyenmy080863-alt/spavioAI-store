-- Preorders: administrators choose which products can be preordered and the deposit
-- customers pay at checkout (fixed EUR amount per unit, or a percentage of the price).
-- The remaining balance is due when the product ships.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS preorder_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preorder_deposit_type text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS preorder_deposit_value numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preorder_release_date date;

ALTER TABLE public.products
  ADD CONSTRAINT products_preorder_deposit_type_check
    CHECK (preorder_deposit_type IN ('fixed', 'percent')),
  ADD CONSTRAINT products_preorder_deposit_value_check
    CHECK (
      preorder_deposit_value >= 0
      AND (preorder_deposit_type <> 'percent' OR preorder_deposit_value <= 100)
    ),
  ADD CONSTRAINT products_preorder_deposit_required_check
    CHECK (NOT preorder_enabled OR preorder_deposit_value > 0);

CREATE INDEX IF NOT EXISTS products_preorder_enabled_idx
  ON public.products (preorder_enabled) WHERE preorder_enabled;
