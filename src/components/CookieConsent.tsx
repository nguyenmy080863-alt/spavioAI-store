import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cookie } from "lucide-react";
import { Link } from "@/i18n/LocaleLink";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OPTIONAL_CATEGORIES, useConsent, type ConsentCategory } from "@/context/ConsentContext";

const CATEGORY_ORDER: ConsentCategory[] = ["necessary", ...OPTIONAL_CATEGORIES];

const buttonBase =
  "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-xs font-semibold tracking-wide transition-[filter,background-color,color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
// "Accept" and "Only necessary" are styled equally so refusing is as easy as accepting (TTDSG).
const primaryButton = `${buttonBase} bg-brand-gradient text-white shadow-glow hover:brightness-110`;
const secondaryButton = `${buttonBase} border border-accent/40 bg-background text-foreground hover:bg-secondary`;

const CookieSettingsDialog = () => {
  const { t } = useTranslation("common");
  const { consent, settingsOpen, closeSettings, save, acceptAll, rejectAll } = useConsent();
  const [draft, setDraft] = useState({ preferences: false, analytics: false, marketing: false });

  // Start from the stored choice every time the dialog opens.
  useEffect(() => {
    if (settingsOpen) {
      setDraft({
        preferences: consent?.preferences ?? false,
        analytics: consent?.analytics ?? false,
        marketing: consent?.marketing ?? false,
      });
    }
  }, [settingsOpen, consent]);

  return (
    <Dialog open={settingsOpen} onOpenChange={(open) => !open && closeSettings()}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl font-normal">{t("cookies.settingsTitle")}</DialogTitle>
          <DialogDescription>{t("cookies.settingsText")}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {CATEGORY_ORDER.map((category) => {
            const locked = category === "necessary";
            const checked = locked || draft[category as keyof typeof draft];
            const id = `cookie-${category}`;
            return (
              <li key={category} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor={id} className="text-sm font-semibold text-foreground">
                    {t(`cookies.categories.${category}.title`)}
                  </label>
                  {locked ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">{t("cookies.alwaysOn")}</span>
                  ) : (
                    <Switch
                      id={id}
                      checked={checked}
                      onCheckedChange={(value) => setDraft((d) => ({ ...d, [category]: value }))}
                    />
                  )}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t(`cookies.categories.${category}.text`)}</p>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={secondaryButton} onClick={rejectAll}>
            {t("cookies.rejectAll")}
          </button>
          <button type="button" className={secondaryButton} onClick={() => save(draft)}>
            {t("cookies.saveSelection")}
          </button>
          <button type="button" className={primaryButton} onClick={acceptAll}>
            {t("cookies.acceptAll")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/** First-visit banner plus the settings dialog (also reachable from the footer). */
const CookieConsent = () => {
  const { t } = useTranslation("common");
  const { consent, ready, acceptAll, rejectAll, openSettings, settingsOpen } = useConsent();
  const showBanner = ready && !consent && !settingsOpen;

  return (
    <>
      {showBanner && (
        <div
          role="region"
          aria-label={t("cookies.title")}
          className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4 animate-fade-in"
        >
          <div className="mx-auto max-w-4xl rounded-2xl border border-accent/20 bg-background/95 p-5 shadow-[0_-8px_40px_rgba(83,70,167,0.18)] backdrop-blur-xl sm:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
              <div className="flex gap-3 md:flex-1">
                <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">{t("cookies.title")}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t("cookies.text")}{" "}
                    <Link to="/privacy-policy" className="font-medium text-accent underline-offset-2 hover:underline">
                      {t("cookies.privacyLink")}
                    </Link>
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 md:flex-nowrap">
                <button type="button" className={`${secondaryButton} flex-1 md:flex-none`} onClick={openSettings}>
                  {t("cookies.settings")}
                </button>
                <button type="button" className={`${secondaryButton} flex-1 md:flex-none`} onClick={rejectAll}>
                  {t("cookies.rejectAll")}
                </button>
                <button type="button" className={`${primaryButton} w-full md:w-auto`} onClick={acceptAll}>
                  {t("cookies.acceptAll")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <CookieSettingsDialog />
    </>
  );
};

export default CookieConsent;
