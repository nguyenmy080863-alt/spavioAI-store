import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProductRow } from "@/lib/catalog";

export interface Line {
  product_id: string;
  quantity: string;
  price: string;
}

interface Props {
  products: ProductRow[];
  lines: Line[];
  onChange: (lines: Line[]) => void;
  priceLabel: string;
  defaultPrice: (product: ProductRow) => number;
  disabled?: boolean;
}

/** Rows of product + quantity + unit price, shared by purchase and sales order forms. */
const LineItemsEditor = ({ products, lines, onChange, priceLabel, defaultPrice, disabled }: Props) => {
  const update = (index: number, patch: Partial<Line>) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const usedIds = new Set(lines.map((line) => line.product_id));

  return (
    <div className="space-y-3">
      {lines.map((line, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <Select
            value={line.product_id}
            disabled={disabled}
            onValueChange={(value) => {
              const product = products.find((p) => p.id === value);
              update(index, { product_id: value, price: product ? String(defaultPrice(product)) : line.price });
            }}
          >
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Choose product" />
            </SelectTrigger>
            <SelectContent>
              {products.map((product) => (
                <SelectItem
                  key={product.id}
                  value={product.id}
                  disabled={usedIds.has(product.id) && product.id !== line.product_id}
                >
                  {product.name} ({product.sku})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={1}
            value={line.quantity}
            disabled={disabled}
            onChange={(e) => update(index, { quantity: e.target.value })}
            className="w-24"
            aria-label="Quantity"
            placeholder="Qty"
          />
          <Input
            type="number"
            min={0}
            step="0.01"
            value={line.price}
            disabled={disabled}
            onChange={(e) => update(index, { price: e.target.value })}
            className="w-28"
            aria-label={priceLabel}
            placeholder={priceLabel}
          />
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(lines.filter((_, i) => i !== index))}>
              Remove
            </Button>
          )}
        </div>
      ))}
      {!disabled && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...lines, { product_id: "", quantity: "1", price: "0" }])}
        >
          Add product
        </Button>
      )}
    </div>
  );
};

export default LineItemsEditor;

/** Validates lines and converts them to numbers; returns an error message when invalid. */
export const parseLines = (lines: Line[]) => {
  if (lines.length === 0) return { error: "Add at least one product" } as const;
  const parsed = [];
  for (const line of lines) {
    const quantity = Number(line.quantity);
    const price = Number(line.price);
    if (!line.product_id) return { error: "Choose a product on every line" } as const;
    if (!Number.isInteger(quantity) || quantity < 1) return { error: "Quantities must be whole numbers above 0" } as const;
    if (!Number.isFinite(price) || price < 0) return { error: "Prices cannot be negative" } as const;
    parsed.push({ product_id: line.product_id, quantity, price });
  }
  return { lines: parsed } as const;
};
