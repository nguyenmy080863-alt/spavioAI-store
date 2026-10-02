import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, run } from "@/lib/orders";
import { formatDateTime } from "@/lib/warranty";
import { Button } from "@/components/ui/button";

interface OutboxRow {
  id: string;
  kind: "order_received" | "payment_confirmed" | "order_shipped";
  to_email: string;
  language: string;
  status: "pending" | "sent" | "failed";
  attempts: number;
  last_error: string;
  created_at: string;
  sent_at: string | null;
}

const KIND_LABEL: Record<OutboxRow["kind"], string> = {
  order_received: "Order received",
  payment_confirmed: "Payment confirmed",
  order_shipped: "Order shipped",
};

const STATUS_LABEL: Record<OutboxRow["status"], string> = {
  pending: "Queued, not sent yet",
  sent: "Sent",
  failed: "Failed",
};

/** Customer emails queued for an order (checkout orders only). */
const OrderEmails = ({ orderId }: { orderId: string }) => {
  const queryClient = useQueryClient();

  const { data: rows = [] } = useQuery({
    queryKey: ["order-emails", orderId],
    queryFn: async (): Promise<OutboxRow[]> => {
      const { data, error } = await db
        .from("email_outbox")
        .select("id, kind, to_email, language, status, attempts, last_error, created_at, sent_at")
        .eq("sales_order_id", orderId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data as OutboxRow[];
    },
    retry: false,
  });

  const retry = useMutation({
    mutationFn: (id: string) =>
      run(db.from("email_outbox").update({ status: "pending", attempts: 0, last_error: "" }).eq("id", id)),
    onSuccess: () => {
      toast.success("Email queued again");
      void queryClient.invalidateQueries({ queryKey: ["order-emails", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (rows.length === 0) return null;

  return (
    <div className="border border-border p-4 space-y-3">
      <h2 className="text-sm font-medium text-foreground">Customer emails</h2>
      <ul className="divide-y divide-border text-sm">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
            <span>
              <span className="text-foreground">{KIND_LABEL[row.kind]}</span>
              <span className="block text-xs text-muted-foreground">
                To {row.to_email} ({row.language.toUpperCase()}) · queued {formatDateTime(row.created_at)}
                {row.sent_at && ` · sent ${formatDateTime(row.sent_at)}`}
              </span>
              {row.last_error && <span className="block text-xs text-destructive">{row.last_error}</span>}
            </span>
            <span className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{STATUS_LABEL[row.status]}</span>
              {row.status === "failed" && (
                <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate(row.id)}>
                  Retry
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default OrderEmails;
