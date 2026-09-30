import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchActiveFomoCampaign, type FomoCampaign } from "@/lib/fomo";

export const useFomoCampaign = () =>
  useQuery({
    queryKey: ["fomo-campaign"],
    queryFn: fetchActiveFomoCampaign,
    staleTime: 5 * 60_000,
  });

interface FomoSessionState {
  /** Config fingerprint — a changed admin config restarts the session. */
  fingerprint: string;
  /** Timestamp (ms) the current countdown ends at. */
  endsAt: number;
  /** Timestamp (ms) the next cycle starts at (delay reset mode). */
  resumeAt: number;
  sold: number;
  soldUpdatedAt: number;
}

const storageKey = (campaignId: string) => `spavioai-fomo-${campaignId}`;

const fingerprintOf = (c: FomoCampaign) =>
  [
    c.duration_hours,
    c.reset_mode,
    c.reset_delay_hours,
    c.total_fake_stock,
    c.initial_sold_percent,
    c.max_sold_percent,
  ].join("|");

const readState = (campaignId: string): FomoSessionState | null => {
  try {
    const raw = localStorage.getItem(storageKey(campaignId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FomoSessionState;
    if (typeof parsed?.endsAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeState = (campaignId: string, state: FomoSessionState) => {
  try {
    localStorage.setItem(storageKey(campaignId), JSON.stringify(state));
  } catch {
    /* storage unavailable — the widget still works for this page view */
  }
};

const hours = (value: number) => Math.max(0, value) * 60 * 60 * 1000;

const initialSold = (campaign: FomoCampaign) => {
  const cap = Math.floor((campaign.max_sold_percent / 100) * campaign.total_fake_stock);
  const start = Math.round((campaign.initial_sold_percent / 100) * campaign.total_fake_stock);
  return Math.min(Math.max(0, start), Math.max(0, cap), campaign.total_fake_stock);
};

const freshState = (campaign: FomoCampaign, now: number): FomoSessionState => ({
  fingerprint: fingerprintOf(campaign),
  endsAt: now + hours(campaign.duration_hours),
  resumeAt: 0,
  sold: initialSold(campaign),
  soldUpdatedAt: now,
});

export interface FomoTimer {
  /** True while a countdown is running (false during a delayed reset pause). */
  running: boolean;
  hours: number;
  minutes: number;
  seconds: number;
  totalStock: number;
  sold: number;
  soldPercent: number;
}

/**
 * Session-based evergreen countdown. The end timestamp lives in localStorage so
 * reloads continue seamlessly, and expiry restarts a cycle per the admin rules.
 */
export const useFomoTimer = (campaign: FomoCampaign | null | undefined): FomoTimer | null => {
  const [state, setState] = useState<FomoSessionState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const campaignId = campaign?.id;
  const stateRef = useRef<FomoSessionState | null>(null);
  stateRef.current = state;

  const persist = useCallback(
    (next: FomoSessionState) => {
      if (!campaignId) return;
      writeState(campaignId, next);
      setState(next);
    },
    [campaignId],
  );

  // Boot / re-boot the session whenever the campaign or its config changes.
  useEffect(() => {
    if (!campaign) {
      setState(null);
      return;
    }
    const current = Date.now();
    const stored = readState(campaign.id);
    if (!stored || stored.fingerprint !== fingerprintOf(campaign)) {
      persist(freshState(campaign, current));
    } else {
      setState(stored);
    }
    setNow(current);
  }, [campaign, persist]);

  // Tick once per second.
  useEffect(() => {
    if (!campaign) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [campaign]);

  // Expiry / reset handling and simulated live purchases.
  useEffect(() => {
    if (!campaign || !state) return;

    if (state.resumeAt > 0) {
      if (now >= state.resumeAt) persist(freshState(campaign, now));
      return;
    }

    if (now >= state.endsAt) {
      if (campaign.reset_mode === "delay" && campaign.reset_delay_hours > 0) {
        persist({
          ...state,
          endsAt: state.endsAt,
          resumeAt: now + hours(campaign.reset_delay_hours),
        });
      } else {
        persist(freshState(campaign, now));
      }
      return;
    }

    if (!campaign.auto_increment_enabled) return;
    const interval = Math.max(10, campaign.increment_interval_seconds) * 1000;
    if (now - state.soldUpdatedAt < interval) return;
    const cap = Math.floor((campaign.max_sold_percent / 100) * campaign.total_fake_stock);
    if (state.sold >= cap) return;
    const min = Math.max(0, Math.min(campaign.increment_min, campaign.increment_max));
    const max = Math.max(min, campaign.increment_max);
    const step = min + Math.floor(Math.random() * (max - min + 1));
    persist({ ...state, sold: Math.min(cap, state.sold + step), soldUpdatedAt: now });
  }, [campaign, state, now, persist]);

  return useMemo(() => {
    if (!campaign || !state) return null;
    const running = state.resumeAt === 0 && now < state.endsAt;
    const remaining = Math.max(0, state.endsAt - now);
    const totalSeconds = Math.floor(remaining / 1000);
    const sold = Math.min(state.sold, campaign.total_fake_stock);
    return {
      running,
      hours: Math.floor(totalSeconds / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
      totalStock: campaign.total_fake_stock,
      sold,
      soldPercent:
        campaign.total_fake_stock > 0
          ? Math.min(100, Math.round((sold / campaign.total_fake_stock) * 100))
          : 0,
    };
  }, [campaign, state, now]);
};
