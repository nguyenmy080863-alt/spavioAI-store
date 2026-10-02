import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { addCustomerMessage, warrantyState, type PublicTicket } from "@/lib/warranty";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const dateTime = (value: string, lang: string) => new Date(value).toLocaleString(lang);

interface TicketViewProps {
  ticket: PublicTicket;
  /** Email used to look the ticket up; signed-in owners may pass an empty string. */
  email: string;
}

/** Customer view of a ticket: status, warranty standing, visit date and the public conversation. */
const TicketView = ({ ticket, email }: TicketViewProps) => {
  const { t, i18n } = useTranslation("shop");
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");

  const state = warrantyState(ticket);
  const closed = ticket.status === "closed";

  const send = useMutation({
    mutationFn: () => addCustomerMessage(ticket.ticket_number, email, reply.trim()),
    onSuccess: () => {
      setReply("");
      void queryClient.invalidateQueries({ queryKey: ["public-ticket", ticket.ticket_number] });
    },
    onError: (e: Error) => toast.error(t("warranty.ticket.replyError"), { description: e.message }),
  });

  const facts: [string, string][] = [
    [t("warranty.ticket.product"), ticket.product_name],
    [t("warranty.ticket.serial"), ticket.serial_number],
    [t("warranty.ticket.opened"), dateTime(ticket.created_at, i18n.language)],
    [t("warranty.ticket.visit"), ticket.visit_scheduled_at ? dateTime(ticket.visit_scheduled_at, i18n.language) : ""],
  ];

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <h2 className="text-xl font-light text-foreground">{ticket.ticket_number}</h2>
          <span className="rounded-full bg-accent/10 text-accent px-3 py-0.5 text-xs font-medium">
            {t(`warranty.ticket.status.${ticket.status}`)}
          </span>
          <span className="text-xs text-muted-foreground">{t(`warranty.ticket.types.${ticket.type}`)}</span>
        </div>
        <p className="text-foreground">{ticket.subject}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {t(`warranty.ticket.warranty.${state}`, {
            date: ticket.warranty_expires_at ? new Date(ticket.warranty_expires_at).toLocaleDateString(i18n.language) : "",
          })}
        </p>
      </div>

      <dl className="grid sm:grid-cols-2 gap-4 border border-border p-5 text-sm">
        {facts
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-foreground break-words">{value}</dd>
            </div>
          ))}
      </dl>

      {ticket.resolution && (
        <div className="border border-emerald-500/40 bg-emerald-500/5 p-5">
          <p className="text-xs text-muted-foreground mb-1">{t("warranty.ticket.resolution")}</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{ticket.resolution}</p>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">{t("warranty.ticket.conversation")}</h3>
        <div className="border border-border p-4">
          <p className="text-xs text-muted-foreground mb-1">
            {t("warranty.ticket.you")} · {dateTime(ticket.created_at, i18n.language)}
          </p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{ticket.description}</p>
        </div>
        {ticket.messages.map((message) => {
          const staff = message.author_type === "staff";
          return (
            <div
              key={`${message.created_at}-${message.author_type}`}
              className={`border p-4 ${staff ? "border-primary/30 bg-primary/5" : "border-border"}`}
            >
              <p className="text-xs text-muted-foreground mb-1">
                {staff ? t("warranty.ticket.support") : t("warranty.ticket.you")} ·{" "}
                {dateTime(message.created_at, i18n.language)}
              </p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{message.body}</p>
            </div>
          );
        })}
      </div>

      {closed ? (
        <p className="text-sm text-muted-foreground">{t("warranty.ticket.closed")}</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (reply.trim()) send.mutate();
          }}
        >
          <label htmlFor="ticket-reply" className="text-sm text-foreground">
            {t("warranty.ticket.reply")}
          </label>
          <Textarea
            id="ticket-reply"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={t("warranty.ticket.replyPlaceholder")}
            rows={4}
            maxLength={4000}
          />
          <Button type="submit" size="sm" disabled={send.isPending || !reply.trim()}>
            {send.isPending ? t("warranty.ticket.sending") : t("warranty.ticket.send")}
          </Button>
        </form>
      )}
    </div>
  );
};

export default TicketView;
