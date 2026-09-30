import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Cookie consent (GDPR / TTDSG). "necessary" is always on: cart, login session, this consent
 * choice. Anything optional (analytics, marketing pixels, embedded third-party content) must check
 * `hasConsent(...)` before it loads.
 */
export type ConsentCategory = "necessary" | "preferences" | "analytics" | "marketing";
export const OPTIONAL_CATEGORIES = ["preferences", "analytics", "marketing"] as const;

export interface ConsentState {
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
  /** Bump CONSENT_VERSION when categories or their purpose change to ask again. */
  version: number;
  updatedAt: string;
}

const STORAGE_KEY = "spavioai-cookie-consent";
const CONSENT_VERSION = 1;

const readConsent = (): ConsentState | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    return parsed.version === CONSENT_VERSION ? parsed : null;
  } catch {
    return null;
  }
};

interface ConsentContextValue {
  /** null until the visitor has made a choice (or while prerendering). */
  consent: ConsentState | null;
  /** True once the browser has read the stored choice; the banner waits for this. */
  ready: boolean;
  hasConsent: (category: ConsentCategory) => boolean;
  save: (choice: Pick<ConsentState, "preferences" | "analytics" | "marketing">) => void;
  acceptAll: () => void;
  rejectAll: () => void;
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}

const ConsentContext = createContext<ConsentContextValue | undefined>(undefined);

export const ConsentProvider = ({ children }: { children: ReactNode }) => {
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setConsent(readConsent());
    setReady(true);
  }, []);

  const save = useCallback((choice: Pick<ConsentState, "preferences" | "analytics" | "marketing">) => {
    const next: ConsentState = { ...choice, version: CONSENT_VERSION, updatedAt: new Date().toISOString() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable (private mode): the choice still applies for this visit.
    }
    setConsent(next);
    setSettingsOpen(false);
    window.dispatchEvent(new CustomEvent("spavioai:consent", { detail: next }));
  }, []);

  const value = useMemo<ConsentContextValue>(
    () => ({
      consent,
      ready,
      hasConsent: (category) => category === "necessary" || Boolean(consent?.[category]),
      save,
      acceptAll: () => save({ preferences: true, analytics: true, marketing: true }),
      rejectAll: () => save({ preferences: false, analytics: false, marketing: false }),
      settingsOpen,
      openSettings: () => setSettingsOpen(true),
      closeSettings: () => setSettingsOpen(false),
    }),
    [consent, ready, save, settingsOpen],
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
};

export const useConsent = () => {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent must be used within ConsentProvider");
  return ctx;
};
