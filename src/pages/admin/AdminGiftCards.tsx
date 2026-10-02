import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  GIFT_CARD_STATE_LABEL,
  MAX_GIFT_CARD,
  TRANSACTION_LABEL,
  adjustGiftCard,
  createGiftCard,
  fetchGiftCardTransactions,
  fetchGiftCards,
  giftCardMessage,
  giftCardState,
  setGiftCardStatus,
  type GiftCard,
  type GiftCardState,
} from "@/lib/giftCards";
import { formatDate } from "@/lib/orders";
import { formatDateTime } from "@/lib/warranty";
import { formatPrice } from "@/data/products";
import { logAudit } from "@/lib/audit";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATE_STYLE: Record<GiftCardState, string> = {
  active: "bg-emerald-500/10 text-emerald-700",
  used_up: "bg-muted text-muted-foreground",
  expired: "bg-amber-500/10 text-amber-700",
  disabled: "bg-destructive/10 text-destructive",
};

const copy = async (text: string, done: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("Could not copy. Select the text and copy it by hand.");
  }
};

const IssueForm = ({ onDone }: { onDone: () => void }) => {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("50");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [expires, setExpires] = useState("");
  const [created, setCreated] = useState<GiftCard | null>(null);
  const [language, setLanguage] = useState<"de" | "en" | "vi">("de");

  const create = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!(value > 0 && value <= MAX_GIFT_CARD)) throw new Error(`The value must be between 1 and ${MAX_GIFT_CARD} EUR`);
      const result = await createGiftCard({
        amount: value,
        email: email.trim(),
        name: name.trim(),
        note: note.trim(),
        expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
      });
      await logAudit("issue", "gift_card", result.id, { amount: value });
      return { result, value };
    },
    onSuccess: ({ result, value }) => {
      toast.success("Gift card created");
      setCreated({
        id: result.id,
        code: result.code,
        initial_amount: value,
        balance: value,
        recipient_email: email.trim(),
        recipient_name: name.trim(),
        note: note.trim(),
        status: "active",
        expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
        created_at: new Date().toISOString(),
      });
      void queryClient.invalidateQueries({ queryKey: ["gift-cards"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (created) {
    const message = giftCardMessage(created, language);
    return (
      <div className="border border-border p-5 space-y-4 max-w-2xl">
        <h2 className="text-sm font-medium text-foreground">Gift card created</h2>
        <p className="text-sm">
          Code <span className="font-mono text-foreground">{created.code}</span> · {formatPrice(created.initial_amount)}
        </p>
        <div className="flex gap-2 items-center">
          <Select value={language} onValueChange={(v) => setLanguage(v as "de" | "en" | "vi")}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="de">Deutsch</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="vi">Tiếng Việt</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => copy(created.code, "Code copied")}>
            Copy code
          </Button>
          <Button size="sm" variant="outline" onClick={() => copy(message, "Message copied")}>
            Copy message
          </Button>
        </div>
        <Textarea readOnly value={message} rows={9} className="text-xs" />
        <p className="text-xs text-muted-foreground">
          The card is not emailed from the store yet: send the code to the recipient yourself. You can open it again in
          the list below.
        </p>
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form
      className="border border-border p-5 space-y-4 max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <h2 className="text-sm font-medium text-foreground">Issue a gift card</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="g-amount">Value (EUR, max {MAX_GIFT_CARD})</Label>
          <Input id="g-amount" type="number" min={1} max={MAX_GIFT_CARD} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="g-expires">Expires (optional)</Label>
          <Input id="g-expires" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="g-name">Recipient name (optional)</Label>
          <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="g-email">Recipient email (optional)</Label>
          <Input id="g-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="g-note">Internal note (why it was issued)</Label>
        <Textarea id="g-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="Goodwill for late delivery, competition prize…" />
      </div>
      <p className="text-xs text-muted-foreground">
        No expiry by default. In Germany a gift card generally cannot expire within 3 years, so only set a date after
        checking with your advisor.
      </p>
      <div className="flex gap-3">
        <Button type="submit" size="sm" disabled={create.isPending}>
          Create gift card
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
};

const CardDetail = ({ card, onClose }: { card: GiftCard; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [adjust, setAdjust] = useState("");
  const [reason, setReason] = useState("");
  const [language, setLanguage] = useState<"de" | "en" | "vi">("de");

  const { data: ledger = [] } = useQuery({
    queryKey: ["gift-card-ledger", card.id],
    queryFn: () => fetchGiftCardTransactions(card.id),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["gift-cards"] });
    void queryClient.invalidateQueries({ queryKey: ["gift-card-ledger", card.id] });
  };

  const toggle = useMutation({
    mutationFn: async () => {
      await setGiftCardStatus(card.id, card.status === "disabled");
      await logAudit(card.status === "disabled" ? "enable" : "disable", "gift_card", card.id, {});
    },
    onSuccess: () => {
      toast.success("Gift card updated");
      refresh();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const correct = useMutation({
    mutationFn: async () => {
      const value = Number(adjust);
      if (!value) throw new Error("Enter an amount (use a minus sign to take value off)");
      await adjustGiftCard(card.id, value, reason);
      await logAudit("adjust", "gift_card", card.id, { amount: value, reason });
    },
    onSuccess: () => {
      toast.success("Balance corrected");
      setAdjust("");
      setReason("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const state = giftCardState(card);

  return (
    <div className="border border-border p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-foreground">{card.code}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatPrice(card.balance)} left of {formatPrice(card.initial_amount)} · issued {formatDate(card.created_at)}
            {card.expires_at && ` · expires ${formatDate(card.expires_at)}`}
          </p>
          {(card.recipient_name || card.recipient_email) && (
            <p className="text-xs text-muted-foreground">For {[card.recipient_name, card.recipient_email].filter(Boolean).join(" · ")}</p>
          )}
          {card.note && <p className="text-xs text-muted-foreground">Note: {card.note}</p>}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE_STYLE[state]}`}>{GIFT_CARD_STATE_LABEL[state]}</span>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Button size="sm" variant="outline" onClick={() => copy(card.code, "Code copied")}>
          Copy code
        </Button>
        <Select value={language} onValueChange={(v) => setLanguage(v as "de" | "en" | "vi")}>
          <SelectTrigger className="w-32 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="de">Deutsch</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="vi">Tiếng Việt</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => copy(giftCardMessage(card, language), "Message copied")}>
          Copy message
        </Button>
        <Button
          size="sm"
          variant={card.status === "disabled" ? "default" : "destructive"}
          disabled={toggle.isPending}
          onClick={() => {
            if (card.status === "disabled" || window.confirm("Switch this card off? It cannot be used until you switch it on again.")) toggle.mutate();
          }}
        >
          {card.status === "disabled" ? "Switch on" : "Switch off"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-foreground">Correct the balance</p>
        <div className="grid sm:grid-cols-[8rem_1fr_auto] gap-2">
          <Input type="number" step="0.01" placeholder="+10 or -5" value={adjust} onChange={(e) => setAdjust(e.target.value)} />
          <Input placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          <Button size="sm" variant="outline" disabled={correct.isPending} onClick={() => correct.mutate()}>
            Apply
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">The balance can never be below 0 or above {MAX_GIFT_CARD} EUR.</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-foreground">History</p>
        <ul className="border border-border divide-y divide-border text-sm">
          {ledger.length === 0 && <li className="p-3 text-muted-foreground">Nothing yet.</li>}
          {ledger.map((line) => (
            <li key={line.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <span>
                {TRANSACTION_LABEL[line.type]}
                {line.sales_orders?.order_number && ` · ${line.sales_orders.order_number}`}
                {line.return_requests?.return_number && ` · ${line.return_requests.return_number}`}
                <span className="block text-xs text-muted-foreground">
                  {formatDateTime(line.created_at)}
                  {line.note && line.type !== "redeemed" && ` · ${line.note}`}
                </span>
              </span>
              <span className={Number(line.amount) < 0 ? "text-muted-foreground" : "text-emerald-700"}>
                {Number(line.amount) > 0 ? "+" : "−"}
                {formatPrice(Math.abs(Number(line.amount)))}
                <span className="block text-xs text-muted-foreground text-right">balance {formatPrice(Number(line.balance_after))}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const AdminGiftCards = () => {
  const { roles } = useAdminAuth();
  const allowed = roles.includes("super_admin") || roles.includes("order_processor");
  const [issuing, setIssuing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("all");

  const { data: cards = [], isLoading, error } = useQuery({
    queryKey: ["gift-cards"],
    queryFn: fetchGiftCards,
    enabled: allowed,
    retry: false,
  });

  const totals = useMemo(() => {
    const live = cards.filter((c) => giftCardState(c) === "active");
    return {
      outstanding: live.reduce((sum, c) => sum + c.balance, 0),
      count: live.length,
      issued: cards.reduce((sum, c) => sum + c.initial_amount, 0),
    };
  }, [cards]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return cards.filter(
      (c) =>
        (state === "all" || giftCardState(c) === state) &&
        (!term ||
          c.code.toLowerCase().includes(term) ||
          c.recipient_email.toLowerCase().includes(term) ||
          c.recipient_name.toLowerCase().includes(term) ||
          c.note.toLowerCase().includes(term)),
    );
  }, [cards, search, state]);

  if (!allowed) {
    return <p className="text-sm text-muted-foreground">Only Super Admins and Order Processors can see gift cards.</p>;
  }

  const open = cards.find((c) => c.id === openId) ?? null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-light text-foreground">Gift cards</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Issue gift cards for goodwill, prizes or gifts. Customers enter the code at checkout and the value is used
            for their order (up to {MAX_GIFT_CARD} EUR per card).
          </p>
        </div>
        {!issuing && (
          <Button size="sm" onClick={() => { setOpenId(null); setIssuing(true); }}>
            Issue gift card
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-xl">
        {[
          ["Outstanding balance", formatPrice(totals.outstanding)],
          ["Cards with balance", String(totals.count)],
          ["Total issued", formatPrice(totals.issued)],
        ].map(([label, value]) => (
          <div key={label} className="border border-border p-4">
            <p className="text-xl font-light text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      {issuing && <IssueForm onDone={() => setIssuing(false)} />}
      {open && !issuing && <CardDetail key={open.id} card={open} onClose={() => setOpenId(null)} />}

      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search code, recipient or note" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" maxLength={100} />
        <Select value={state} onValueChange={setState}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All cards</SelectItem>
            {(Object.keys(GIFT_CARD_STATE_LABEL) as GiftCardState[]).map((value) => (
              <SelectItem key={value} value={value}>
                {GIFT_CARD_STATE_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}. Has migration 0024 been applied in Supabase?</p>}

      <div className="border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-light text-muted-foreground">
              <th className="p-3">Code</th>
              <th className="p-3">Recipient</th>
              <th className="p-3">Balance</th>
              <th className="p-3">Status</th>
              <th className="p-3">Issued</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">Loading…</td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">No gift cards yet.</td>
              </tr>
            )}
            {rows.map((card) => {
              const current = giftCardState(card);
              return (
                <tr key={card.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-mono text-xs text-foreground">{card.code}</td>
                  <td className="p-3 text-muted-foreground">
                    {card.recipient_name || card.recipient_email || "—"}
                    {card.note && <span className="block text-xs">{card.note}</span>}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {formatPrice(card.balance)} <span className="text-xs">of {formatPrice(card.initial_amount)}</span>
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE_STYLE[current]}`}>{GIFT_CARD_STATE_LABEL[current]}</span>
                  </td>
                  <td className="p-3 text-muted-foreground">{formatDate(card.created_at)}</td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => { setIssuing(false); setOpenId(card.id); }}>
                      Open
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminGiftCards;
