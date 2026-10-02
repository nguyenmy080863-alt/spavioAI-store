import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Link } from "@/i18n/LocaleLink";
import Header from "@/components/header/Header";
import Footer from "@/components/footer/Footer";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { useStorefrontProducts } from "@/hooks/useCatalog";
import { useProductText } from "@/i18n/useProductText";
import { TICKET_TYPES, createTicket, type TicketType } from "@/lib/warranty";

const OTHER_PRODUCT = "__other";

const Field = ({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label htmlFor={id}>{label}</Label>
    {children}
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

/** Public ticket form: works for guests and signed-in customers. */
const WarrantyRequest = () => {
  const { t } = useTranslation("shop");
  const { user } = useAdminAuth();
  const { data: products = [] } = useStorefrontProducts();
  const { localize } = useProductText();

  // The order page links here with the order, email and product already filled in.
  const [prefill] = useSearchParams();
  const [type, setType] = useState<TicketType>("defect");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(prefill.get("email") ?? "");
  const [orderNumber, setOrderNumber] = useState(prefill.get("order") ?? "");
  const [product, setProduct] = useState(prefill.get("product") ?? "");
  const [serial, setSerial] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (user?.email) setEmail((current) => current || user.email!);
  }, [user?.email]);

  const submit = useMutation({
    mutationFn: () =>
      createTicket({
        type,
        name,
        email,
        orderNumber,
        productName: product === OTHER_PRODUCT ? t("warranty.form.productOther") : product,
        serialNumber: serial,
        subject,
        description,
      }),
    onError: (e: Error) => toast.error(t("warranty.form.errorTitle"), { description: e.message }),
  });

  const result = submit.data;

  const reset = () => {
    submit.reset();
    setSubject("");
    setDescription("");
    setSerial("");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO page="warrantyRequest" canonical="/warranty" noindex />
      <Header />
      <main className="flex-1 px-6 py-16 max-w-2xl mx-auto w-full">
        <h1 className="text-3xl font-serif text-foreground mb-3">{t("warranty.title")}</h1>
        <p className="text-sm text-muted-foreground mb-2">{t("warranty.intro")}</p>
        <p className="text-sm mb-10">
          <Link to="/warranty/track" className="text-accent">
            {t("warranty.trackLink")}
          </Link>
        </p>

        {result ? (
          <div className="border border-border p-6 space-y-4">
            <h2 className="text-lg font-light text-foreground">{t("warranty.success.title")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("warranty.success.text", { number: result.ticket_number })}
            </p>
            <p className="text-sm text-muted-foreground">
              {result.purchase_verified ? t("warranty.success.verified") : t("warranty.success.unverified")}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="sm">
                <Link to={`/warranty/track?ticket=${result.ticket_number}&email=${encodeURIComponent(email)}`}>
                  {t("warranty.success.track")}
                </Link>
              </Button>
              <Button size="sm" variant="outline" onClick={reset}>
                {t("warranty.success.another")}
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
          >
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-foreground mb-2">{t("warranty.form.type")}</legend>
              <RadioGroup value={type} onValueChange={(value) => setType(value as TicketType)}>
                {TICKET_TYPES.map((value) => (
                  <div key={value} className="flex items-center gap-3">
                    <RadioGroupItem value={value} id={`type-${value}`} />
                    <Label htmlFor={`type-${value}`} className="font-light">
                      {t(`warranty.form.types.${value}`)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field id="w-name" label={t("warranty.form.name")}>
                <Input id="w-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
              </Field>
              <Field id="w-email" label={t("warranty.form.email")}>
                <Input
                  id="w-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={255}
                />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground -mt-3">{t("warranty.form.emailHint")}</p>

            <Field id="w-order" label={t("warranty.form.orderNumber")} hint={t("warranty.form.orderHint")}>
              <Input
                id="w-order"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="SO-00042"
                maxLength={40}
              />
            </Field>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field id="w-product" label={t("warranty.form.product")}>
                <Select value={product} onValueChange={setProduct}>
                  <SelectTrigger id="w-product">
                    <SelectValue placeholder={t("warranty.form.productPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map(localize).map((item) => (
                      <SelectItem key={item.id} value={item.name}>
                        {item.name}
                      </SelectItem>
                    ))}
                    {product && product !== OTHER_PRODUCT && !products.map(localize).some((item) => item.name === product) && (
                      <SelectItem value={product}>{product}</SelectItem>
                    )}
                    <SelectItem value={OTHER_PRODUCT}>{t("warranty.form.productOther")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field id="w-serial" label={t("warranty.form.serial")} hint={t("warranty.form.serialHint")}>
                <Input id="w-serial" value={serial} onChange={(e) => setSerial(e.target.value)} maxLength={80} />
              </Field>
            </div>

            <Field id="w-subject" label={t("warranty.form.subject")}>
              <Input id="w-subject" value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={160} />
            </Field>

            <Field id="w-description" label={t("warranty.form.description")} hint={t("warranty.form.descriptionHint")}>
              <Textarea
                id="w-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                minLength={10}
                maxLength={4000}
                rows={6}
              />
            </Field>

            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending ? t("warranty.form.submitting") : t("warranty.form.submit")}
            </Button>
          </form>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default WarrantyRequest;
