import { useEffect, useState } from "react";
import { Link, useLocaleNavigate, useLocalizePath } from "@/i18n/LocaleLink";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useLocation } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import heroImage from "@/assets/brand/hero-clinic.jpg";
import StoreLogo from "@/components/StoreLogo";

const buildSchema = (t: TFunction) =>
  z.object({
    email: z.string().trim().email({ message: t("auth.invalidEmail") }).max(255),
    password: z.string().min(8, { message: t("auth.passwordTooShort") }).max(72),
  });

const ATTEMPT_KEY = "spavioai-login-attempts";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

interface AttemptState {
  count: number;
  first: number;
}

const readAttempts = (): AttemptState => {
  try {
    const raw = localStorage.getItem(ATTEMPT_KEY);
    if (!raw) return { count: 0, first: Date.now() };
    const parsed = JSON.parse(raw) as AttemptState;
    if (Date.now() - parsed.first > LOCKOUT_MS) return { count: 0, first: Date.now() };
    return parsed;
  } catch {
    return { count: 0, first: Date.now() };
  }
};

const AuthForm = ({ mode }: { mode: "signin" | "signup" }) => {
  const navigate = useLocaleNavigate();
  const localize = useLocalizePath();
  const { t } = useTranslation("common");
  const location = useLocation();
  const { user, isAdmin, loading, refreshRoles } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? null;

  useEffect(() => {
    const attempts = readAttempts();
    if (attempts.count >= MAX_ATTEMPTS) setLockedUntil(attempts.first + LOCKOUT_MS);
  }, []);

  // Already signed in — send admins to the admin panel, shoppers back where they came from.
  useEffect(() => {
    if (loading || !user) return;
    if (redirectTo) navigate(redirectTo, { replace: true });
    else navigate(isAdmin ? "/admin" : "/", { replace: true });
  }, [loading, user, isAdmin, redirectTo, navigate]);

  const registerFailure = () => {
    const attempts = readAttempts();
    const next = {
      count: attempts.count + 1,
      first: attempts.count === 0 ? Date.now() : attempts.first,
    };
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(next));
    if (next.count >= MAX_ATTEMPTS) setLockedUntil(next.first + LOCKOUT_MS);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lockedUntil && Date.now() < lockedUntil) {
      toast.error(t("auth.tooManyAttempts"));
      return;
    }

    const parsed = buildSchema(t).safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: `${window.location.origin}${localize("/login")}`,
            data: { marketing_consent: marketingConsent },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setPendingConfirm(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) {
          registerFailure();
          throw error;
        }
      }

      localStorage.removeItem(ATTEMPT_KEY);
      // First user of a fresh install becomes Super Admin.
      await supabase.rpc("claim_first_admin");
      await refreshRoles();
      const { data: roleRows } = await supabase.from("user_roles").select("role");
      const hasAdminRole = (roleRows ?? []).length > 0;
      toast.success(mode === "signup" ? t("auth.accountCreated") : t("auth.welcomeBack"));
      navigate(redirectTo ?? (hasAdminRole ? "/admin" : "/"), { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("auth.signInFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background grid grid-cols-1 lg:grid-cols-12 font-sans select-none">
      {/* Visual side panel (Desktop) */}
      <div className="hidden lg:flex lg:col-span-6 relative items-center justify-center bg-[#120D1F] overflow-hidden">
        <img
          src={heroImage}
          alt={t("auth.panel.imageAlt")}
          className="absolute inset-0 w-full h-full object-cover opacity-70 scale-100 hover:scale-105 transition-transform ease-out"
          style={{ transitionDuration: "6000ms" }}
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-[#1E1633]/90 via-[#1E1633]/40 to-transparent" />
        <div className="relative z-10 p-16 text-white max-w-lg space-y-6">
          <Link to="/" className="inline-block">
            <StoreLogo heightClass="h-9" className="rounded-2xl bg-white/90 backdrop-blur-md px-4 py-2.5 shadow-glow" />
          </Link>
          <div className="space-y-4">
            <span className="text-[0.65rem] sm:text-xs tracking-[0.3em] uppercase text-[#D4B8FF] font-semibold block">
              {t("auth.panel.eyebrow")}
            </span>
            <h2 className="text-3xl sm:text-4xl font-serif font-light leading-tight tracking-wide">
              {t("auth.panel.title")}
            </h2>
            <p className="text-sm font-light text-white/70 leading-relaxed font-sans">
              {t("auth.panel.text")}
            </p>
          </div>
          <div className="pt-8 border-t border-white/10 flex gap-8 text-xs font-light text-white/50 tracking-wider">
            <div>
              <p className="text-white font-medium mb-1">{t("auth.panel.warrantyTitle")}</p>
              <p className="text-[10px]">{t("auth.panel.warrantyText")}</p>
            </div>
            <div>
              <p className="text-white font-medium mb-1">{t("auth.panel.bagTitle")}</p>
              <p className="text-[10px]">{t("auth.panel.bagText")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Form side panel */}
      <div className="col-span-1 lg:col-span-6 flex flex-col justify-between p-6 sm:p-12 md:p-16 lg:p-24 bg-background">
        {/* Top bar with back option */}
        <div className="flex justify-between items-center mb-8 lg:mb-0">
          <Link to="/" className="lg:hidden">
            <StoreLogo heightClass="h-7" />
          </Link>
          <Link
            to="/"
            className="text-xs font-light text-muted-foreground hover:text-foreground tracking-wider transition-colors inline-flex items-center gap-1.5 ml-auto"
          >
            ← {t("auth.backToStore")}
          </Link>
        </div>

        {/* Center container */}
        <div className="w-full max-w-md mx-auto my-auto py-8">
          <div className="space-y-2 mb-8 text-left">
            <h1 className="text-2xl sm:text-3xl font-serif font-light tracking-wide text-foreground animate-fade-in">
              {mode === "signin" ? t("auth.signIn") : t("auth.createAccount")}
            </h1>
            <p className="text-sm text-muted-foreground font-light leading-relaxed">
              {mode === "signin"
                ? t("auth.signInIntro")
                : t("auth.signUpIntro")}
            </p>
          </div>

          {pendingConfirm ? (
            <div className="bg-secondary/40 p-6 rounded-sm border border-border/60 text-left space-y-3 animate-fade-in">
              <p className="text-sm font-medium text-foreground">{t("auth.verificationSent")}</p>
              <p className="text-sm text-muted-foreground font-light">
                {t("auth.checkInboxBefore")} <span className="text-foreground font-normal">{email}</span>. {t("auth.checkInboxAfter")}
              </p>
              <Button onClick={() => setPendingConfirm(false)} variant="link" className="text-xs font-light text-accent hover:text-accent/80 p-0 h-auto">
                {t("auth.changeEmail")}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-light tracking-wider uppercase text-muted-foreground">
                  {t("auth.email")}
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={255}
                  required
                  className="rounded-none border-0 border-b border-border bg-transparent px-0 py-3 text-sm focus-visible:ring-0 focus-visible:border-accent transition-colors placeholder:text-muted-foreground/40 md:text-sm h-11"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label htmlFor="password" className="text-xs font-light tracking-wider uppercase text-muted-foreground">
                    {t("auth.password")}
                  </Label>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    maxLength={72}
                    required
                    className="rounded-none border-0 border-b border-border bg-transparent pl-0 pr-10 py-3 text-sm focus-visible:ring-0 focus-visible:border-accent transition-colors placeholder:text-muted-foreground/40 md:text-sm h-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-muted-foreground/75 hover:text-foreground transition-colors"
                    aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {mode === "signup" && (
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="marketingConsent"
                    checked={marketingConsent}
                    onCheckedChange={(checked) => setMarketingConsent(checked === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="marketingConsent" className="text-xs font-light text-muted-foreground leading-relaxed cursor-pointer">
                    {t("auth.marketingConsent")}
                  </Label>
                </div>
              )}

              {lockedUntil && (
                <p className="text-xs text-destructive bg-destructive/5 px-3 py-2 border border-destructive/20 font-light rounded-sm">
                  {t("auth.locked")}
                </p>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full tracking-[0.2em] text-xs font-semibold uppercase py-6 bg-brand-gradient hover:brightness-110 text-white transition-all duration-300 shadow-glow border border-transparent active:scale-[0.99] flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    {t("auth.processing")}
                  </>
                ) : mode === "signin" ? (
                  t("auth.signIn")
                ) : (
                  t("auth.createAccount")
                )}
              </Button>
            </form>
          )}

          <div className="mt-8 pt-6 border-t border-border/40 space-y-4 text-center">
            <Link
              to={mode === "signin" ? "/signup" : "/login"}
              className="block text-xs font-light text-muted-foreground hover:text-foreground tracking-wider transition-colors"
            >
              {mode === "signin" ? (
                <>
                  {t("auth.newHere")} <span className="text-accent font-normal hover:underline">{t("auth.createAnAccount")}</span>
                </>
              ) : (
                <>
                  {t("auth.haveAccount")} <span className="text-accent font-normal hover:underline">{t("auth.signInLink")}</span>
                </>
              )}
            </Link>
            <Link
              to="/"
              className="block text-xs font-light text-muted-foreground hover:text-foreground tracking-wider transition-colors"
            >
              {t("auth.continueAsGuest")}
            </Link>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-[10px] text-muted-foreground font-light text-center tracking-wider mt-auto pt-8">
          &copy; {new Date().getFullYear()} Spavio AI. {t("auth.legalPrefix")}{" "}
          <Link to="/terms-of-service" className="underline hover:text-foreground">{t("auth.terms")}</Link> &{" "}
          <Link to="/privacy-policy" className="underline hover:text-foreground">{t("auth.privacy")}</Link>.
        </div>
      </div>
    </div>
  );
};

export default AuthForm;
