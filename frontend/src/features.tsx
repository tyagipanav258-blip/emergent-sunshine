import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch } from "@/src/api";
import { useAuth } from "@/src/auth";

/**
 * What the elder chose to have on their app.
 *
 * Note what is not in here: SOS, Ask Sunshine, "I'm Okay" and calling family.
 * Those are safety and connection — they are never a preference, so nothing in
 * this file can switch them off.
 */
export type Features = {
  watch_tab_enabled: boolean;
  concierge_tab_enabled: boolean;
  prescription_scan_enabled: boolean;
  medicine_explainer_enabled: boolean;
  appointments_enabled: boolean;
  watch_categories: string[];
  preferred_landing_tab: LandingTab;
  onboarding_complete: boolean;
};

export type LandingTab = "home" | "health" | "watch" | "profile";

/** The reel subjects an elder can choose between. Mirrors the server list. */
export const WATCH_CATEGORY_CHOICES = [
  "Spiritual", "Bhajans", "Songs", "Devotional", "Exercise", "Yoga", "Recipes", "Travel",
];

/** Everything on — what an elder gets before they have chosen anything. */
export const DEFAULT_FEATURES: Features = {
  watch_tab_enabled: true,
  concierge_tab_enabled: true,
  prescription_scan_enabled: true,
  medicine_explainer_enabled: true,
  appointments_enabled: true,
  watch_categories: [...WATCH_CATEGORY_CHOICES],
  preferred_landing_tab: "home",
  onboarding_complete: false,
};

/** Where each landing choice actually lives in the (elder) tab group. */
const TAB_ROUTES: Record<LandingTab, string> = {
  home: "/(elder)",
  health: "/(elder)/health",
  watch: "/(elder)/content",
  profile: "/(elder)/profile",
};

/**
 * The route to open on, with the same guard the server applies: a tab that has
 * since been switched off sends the elder to Home rather than nowhere.
 */
export function landingRoute(f: Features): string {
  const tab = f.preferred_landing_tab;
  if (tab === "watch" && !f.watch_tab_enabled) return TAB_ROUTES.home;
  return TAB_ROUTES[tab] || TAB_ROUTES.home;
}

type FeatureState = {
  features: Features;
  /** True until the first load settles, so routing can wait rather than guess. */
  loading: boolean;
  refresh: () => Promise<void>;
  /** Save a partial change and adopt whatever the server says the result is. */
  save: (patch: Partial<Features>) => Promise<Features>;
};

const FeatureContext = createContext<FeatureState>({} as FeatureState);
export const useFeatures = () => useContext(FeatureContext);

export function FeatureProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [features, setFeatures] = useState<Features>(DEFAULT_FEATURES);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setFeatures(DEFAULT_FEATURES);
      setLoading(false);
      return;
    }
    try {
      setFeatures(await apiFetch<Features>("/features"));
    } catch {
      // A family member who has not linked a parent yet has no settings to read.
      // Falling back to "everything on" keeps the app whole instead of blank.
      setFeatures(DEFAULT_FEATURES);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  const save = useCallback(async (patch: Partial<Features>) => {
    // The elder edits their own; a family member edits the parent's. Same shape,
    // different door — the server decides what each role may write.
    const path = user?.role === "child" ? "/family/elder-features" : "/elder/features";
    const next = await apiFetch<Features>(path, { method: "PUT", body: patch });
    setFeatures(next);
    return next;
  }, [user]);

  return (
    <FeatureContext.Provider value={{ features, loading, refresh, save }}>
      {children}
    </FeatureContext.Provider>
  );
}
