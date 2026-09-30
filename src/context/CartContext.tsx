import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Product } from "@/data/products";
import { depositPerUnit } from "@/lib/preorder";
import { supabase } from "@/integrations/supabase/client";

export interface CartItem {
  id: string;
  name: string;
  category: string;
  /** Effective (charged) unit price — sale price when the product is on sale. */
  price: number;
  /** Regular / RRP unit price, kept for strike-through display when on sale. */
  regularPrice?: number;
  image: string;
  quantity: number;
  /** Preorder items: deposit charged per unit at checkout; the rest is due at shipping. */
  preorder?: { deposit: number; releaseDate: string | null };
}

/** Amount charged at checkout for one cart line (deposit for preorders, full price otherwise). */
export const dueNowForItem = (item: CartItem) => (item.preorder ? item.preorder.deposit : item.price) * item.quantity;

const mergeCarts = (local: CartItem[], remote: CartItem[]): CartItem[] => {
  const merged = [...remote];
  local.forEach((item) => {
    const existing = merged.find((m) => m.id === item.id);
    if (existing) existing.quantity = Math.max(existing.quantity, item.quantity);
    else merged.push(item);
  });
  return merged;
};

interface CartContextValue {
  items: CartItem[];
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  /** Full value of the bag (all items at their full price). */
  subtotal: number;
  /** Charged at checkout: full price of regular items + deposits of preorder items. */
  dueNow: number;
  /** Remaining preorder balance, charged when those items ship. */
  dueLater: number;
  hasPreorders: boolean;
  isBagOpen: boolean;
  openBag: () => void;
  closeBag: () => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

const STORAGE_KEY = "spavioai-cart";

const loadStoredItems = (): CartItem[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as CartItem[]) : [];
  } catch {
    return [];
  }
};

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>(loadStoredItems);
  const [isBagOpen, setIsBagOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignore storage failures (private mode etc.)
    }
  }, [items]);

  // Persist the bag to the signed-in shopper's account so it returns next visit.
  const [userId, setUserId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    void supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // On sign-in, merge the guest bag with the saved bag.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setSyncing(true);
    void (async () => {
      const { data } = await supabase
        .from("saved_carts")
        .select("items")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      const remote = Array.isArray(data?.items) ? (data!.items as unknown as CartItem[]) : [];
      setItems((prev) => mergeCarts(prev, remote));
      setSyncing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Push every change back to the account.
  useEffect(() => {
    if (!userId || syncing) return;
    const timeout = setTimeout(() => {
      void supabase
        .from("saved_carts")
        .upsert(
          { user_id: userId, items: items as unknown as never, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
    }, 400);
    return () => clearTimeout(timeout);
  }, [items, userId, syncing]);

  const addItem = useCallback((product: Product, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      const onSale =
        product.salePrice != null &&
        product.salePrice > 0 &&
        product.salePrice < product.price;
      const unitPrice = onSale ? product.salePrice! : product.price;
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          category: product.category,
          price: unitPrice,
          regularPrice: onSale ? product.price : undefined,
          image: product.image,
          quantity,
          preorder: product.preorder
            ? { deposit: depositPerUnit(unitPrice, product.preorder), releaseDate: product.preorder.releaseDate }
            : undefined,
        },
      ];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((item) => item.id !== id)
        : prev.map((item) => (item.id === id ? { ...item, quantity } : item))
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);
  const openBag = useCallback(() => setIsBagOpen(true), []);
  const closeBag = useCallback(() => setIsBagOpen(false), []);

  const value = useMemo<CartContextValue>(() => {
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const dueNow = Math.round(items.reduce((sum, item) => sum + dueNowForItem(item), 0) * 100) / 100;
    return {
      items,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      totalItems,
      subtotal,
      dueNow,
      dueLater: Math.round((subtotal - dueNow) * 100) / 100,
      hasPreorders: items.some((item) => Boolean(item.preorder)),
      isBagOpen,
      openBag,
      closeBag,
    };
  }, [items, addItem, removeItem, updateQuantity, clearCart, isBagOpen, openBag, closeBag]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};
