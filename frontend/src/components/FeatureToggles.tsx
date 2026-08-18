import { useState } from "react";
import { View, StyleSheet, Pressable, Platform, ActivityIndicator, Switch } from "react-native";
import { AppText } from "@/src/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFeatures, Features, WATCH_CATEGORY_CHOICES } from "@/src/features";
import { theme } from "@/src/theme";

/**
 * The editable half of "what's on this app", shared by the elder's own settings
 * screen and the family's "Manage their app" screen.
 *
 * Both sides write through `useFeatures().save`, which posts to whichever
 * endpoint the signed-in role is allowed to use. Nothing here can reach SOS,
 * Ask Sunshine, "I'm Okay" or calling family — those are never preferences.
 */

type FlagKey =
  | "watch_tab_enabled"
  | "concierge_tab_enabled"
  | "prescription_scan_enabled"
  | "medicine_explainer_enabled"
  | "appointments_enabled";

const ROWS: { key: FlagKey; label: string; detail: string; icon: any }[] = [
  { key: "watch_tab_enabled", label: "Watch", detail: "The reels and videos tab", icon: "play-circle" },
  { key: "concierge_tab_enabled", label: "Care & Concierge requests", detail: "Asking for a refill, a doctor or a taxi", icon: "sparkles" },
  { key: "prescription_scan_enabled", label: "Prescription photo scan", detail: "Adding medicines from a photo", icon: "camera" },
  { key: "medicine_explainer_enabled", label: "Medicine explanations", detail: "What each medicine is for", icon: "information-circle" },
  { key: "appointments_enabled", label: "Appointments", detail: "Upcoming doctor visits", icon: "calendar" },
];

export function FeatureToggles({ testID }: { testID?: string }) {
  const { features, save } = useFeatures();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const tap = () => { if (Platform.OS !== "web") Haptics.selectionAsync(); };

  const write = async (key: string, patch: Partial<Features>) => {
    tap();
    setBusy(key);
    setError("");
    try {
      await save(patch);
    } catch (e: any) {
      setError(e?.message || "We could not save that. Please try again.");
    }
    setBusy(null);
  };

  const toggleCat = (c: string) => {
    const next = features.watch_categories.includes(c)
      ? features.watch_categories.filter((x) => x !== c)
      : [...features.watch_categories, c];
    // The server refuses an empty list; saying so here avoids a round trip that
    // only comes back as an error.
    if (next.length === 0) {
      setError("Please keep at least one kind of video, or switch Watch off.");
      return;
    }
    write("cats", { watch_categories: next });
  };

  return (
    <View testID={testID}>
      <View style={styles.rows}>
        {ROWS.map((r, i) => (
          <View key={r.key}>
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name={r.icon} size={22} color={theme.colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText style={styles.rowLabel}>{r.label}</AppText>
                <AppText style={styles.rowDetail}>{r.detail}</AppText>
              </View>
              {busy === r.key ? (
                <ActivityIndicator color={theme.colors.brand} style={styles.spinner} />
              ) : (
                <Switch
                  value={features[r.key]}
                  onValueChange={(v) => write(r.key, { [r.key]: v } as Partial<Features>)}
                  trackColor={{ false: theme.colors.borderStrong, true: theme.colors.brand }}
                  thumbColor="#fff"
                  testID={`toggle-${r.key}`}
                  accessibilityLabel={`${r.label}. ${r.detail}`}
                />
              )}
            </View>
            {i < ROWS.length - 1 && <View style={styles.divider} />}
          </View>
        ))}
      </View>

      {features.watch_tab_enabled && (
        <View style={styles.catBlock} testID="feature-watch-categories">
          <AppText style={styles.catTitle}>Kinds of video</AppText>
          <AppText style={styles.catSub}>Only these appear in Watch.</AppText>
          <View style={styles.chips}>
            {WATCH_CATEGORY_CHOICES.map((c) => {
              const on = features.watch_categories.includes(c);
              return (
                <Pressable
                  key={c}
                  style={[styles.chip, on && styles.chipOn, busy === "cats" && styles.chipBusy]}
                  disabled={busy === "cats"}
                  onPress={() => toggleCat(c)}
                  testID={`cat-${c}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={c}
                >
                  {on && <Ionicons name="checkmark" size={16} color="#fff" />}
                  <AppText style={[styles.chipText, on && styles.chipTextOn]}>{c}</AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {error ? (
        <AppText style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rows: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, minHeight: 74 },
  rowIcon: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.brandLight,
  },
  rowLabel: { fontSize: theme.font.base, fontWeight: "800", color: theme.colors.onSurface },
  rowDetail: { fontSize: theme.font.sm, color: theme.colors.muted, marginTop: 2, lineHeight: 20 },
  spinner: { width: 51, height: 31 },
  divider: { height: 1, backgroundColor: theme.colors.border, marginLeft: 74 },

  catBlock: {
    marginTop: 14, padding: 16, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceTertiary,
  },
  catTitle: { fontSize: theme.font.base, fontWeight: "800", color: theme.colors.onSurface },
  catSub: { fontSize: theme.font.sm, color: theme.colors.muted, marginTop: 2, marginBottom: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1.5, borderColor: theme.colors.border, minHeight: 44,
  },
  chipOn: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  chipBusy: { opacity: 0.6 },
  chipText: { fontSize: theme.font.sm, fontWeight: "700", color: theme.colors.onSurface },
  chipTextOn: { color: "#fff" },
  error: { fontSize: theme.font.sm, color: theme.colors.error, fontWeight: "700", marginTop: 12 },
});

/** The read-only "this is where their app opens" line. */
export function LandingSummary({ compact }: { compact?: boolean }) {
  const { features } = useFeatures();
  const LABELS: Record<string, string> = {
    home: "Home", health: "Health", watch: "Watch", profile: "Profile",
  };
  return (
    <View style={[landingStyles.wrap, compact && landingStyles.compact]} testID="landing-summary">
      <Ionicons name="enter-outline" size={22} color={theme.colors.brand} />
      <View style={{ flex: 1 }}>
        <AppText style={landingStyles.label}>Opens to</AppText>
        <AppText style={landingStyles.value}>{LABELS[features.preferred_landing_tab] || "Home"}</AppText>
      </View>
    </View>
  );
}

const landingStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border,
    padding: 16, marginTop: 12, minHeight: 64,
  },
  compact: { marginTop: 0 },
  label: { fontSize: theme.font.sm, color: theme.colors.muted, fontWeight: "700" },
  value: { fontSize: theme.font.base, fontWeight: "800", color: theme.colors.onSurface, marginTop: 1 },
});
