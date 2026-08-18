import { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { AppText } from "@/src/components/AppText";
import { GradientButton } from "@/src/components/GradientButton";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { apiFetch } from "@/src/api";
import { LogoMark } from "@/src/components/Logo";
import { useFeatures, LandingTab, WATCH_CATEGORY_CHOICES } from "@/src/features";
import { theme } from "@/src/theme";

/** Screen 2 of first run: which of the surviving tabs should open first. */

const OPTIONS: { key: LandingTab; label: string; detail: string; icon: any }[] = [
  { key: "home", label: "Home", detail: "Today's news and your family", icon: "home" },
  { key: "health", label: "Health", detail: "Your medicines and appointments", icon: "heart" },
  { key: "watch", label: "Watch", detail: "Reels and videos", icon: "play-circle" },
  { key: "profile", label: "Profile", detail: "Your family code and settings", icon: "person" },
];

export default function OnboardingLanding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useFeatures();
  const params = useLocalSearchParams<Record<string, string>>();

  const [choice, setChoice] = useState<LandingTab>("home");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const flag = (k: string) => params[k] !== "0";
  const cats = (params.watch_categories || "").split(",").filter(Boolean);

  // Home, Health and Profile are always there — nothing on the previous screen
  // could remove them. Watch is here only if it survived.
  const options = OPTIONS.filter((o) => o.key !== "watch" || flag("watch_tab_enabled"));

  const finish = async () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setBusy(true);
    setError("");
    try {
      await apiFetch("/elder/onboarding-preferences", {
        method: "POST",
        body: {
          watch_tab_enabled: flag("watch_tab_enabled"),
          concierge_tab_enabled: flag("concierge_tab_enabled"),
          prescription_scan_enabled: flag("prescription_scan_enabled"),
          medicine_explainer_enabled: flag("medicine_explainer_enabled"),
          appointments_enabled: flag("appointments_enabled"),
          watch_categories: cats.length ? cats : WATCH_CATEGORY_CHOICES,
          preferred_landing_tab: choice,
        },
      });
      // Adopt the saved settings before leaving, so the tab bar and the landing
      // tab are already correct on the very first frame of the app.
      await refresh();
      router.replace(choice === "watch" ? "/(elder)/content" : choice === "home" ? "/(elder)" : `/(elder)/${choice}` as any);
    } catch (e: any) {
      setError(e?.message || "We could not save that. Please try again.");
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]} testID="onboarding-landing">
      <View style={styles.header}>
        <LogoMark size={44} />
        <AppText style={styles.step}>Step 2 of 2</AppText>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <AppText style={styles.title}>What would you like to see first when you open the app?</AppText>
        <AppText style={styles.sub}>Whichever you pick, the others are only one tap away.</AppText>

        {options.map((o) => {
          const on = choice === o.key;
          return (
            <Pressable
              key={o.key}
              style={[styles.row, on && styles.rowOn]}
              onPress={() => { if (Platform.OS !== "web") Haptics.selectionAsync(); setChoice(o.key); }}
              testID={`onb-landing-${o.key}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${o.label}. ${o.detail}`}
            >
              <View style={[styles.rowIcon, on && styles.rowIconOn]}>
                <Ionicons name={o.icon} size={26} color={on ? theme.colors.brand : theme.colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText style={styles.rowLabel}>{o.label}</AppText>
                <AppText style={styles.rowDetail}>{o.detail}</AppText>
              </View>
              <View style={[styles.radio, on && styles.radioOn]}>
                {on && <View style={styles.radioDot} />}
              </View>
            </Pressable>
          );
        })}

        {error ? <AppText style={styles.error} accessibilityRole="alert">{error}</AppText> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <GradientButton
          tone="brand"
          style={[styles.primary, busy && styles.disabled]}
          disabled={busy}
          onPress={finish}
          testID="onb-finish"
          accessibilityRole="button"
          accessibilityLabel="Finish and open my app"
        >
          <AppText style={styles.primaryText}>{busy ? "Please wait…" : "Finish"}</AppText>
        </GradientButton>

        <Pressable
          onPress={() => router.back()}
          style={styles.secondary}
          disabled={busy}
          testID="onb-landing-back"
          accessibilityRole="button"
          accessibilityLabel="Go back to the previous question"
        >
          <AppText style={styles.secondaryText}>Back</AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: { alignItems: "center", gap: 8, paddingBottom: 12 },
  step: { fontSize: theme.font.sm, fontWeight: "700", color: theme.colors.muted, letterSpacing: 0.4 },
  title: { fontSize: theme.font.xl, fontWeight: "800", color: theme.colors.onSurface, textAlign: "center", marginBottom: 10 },
  sub: { fontSize: theme.font.base, color: theme.colors.onSurfaceSecondary, textAlign: "center", lineHeight: 26, marginBottom: 22 },

  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.lg, borderWidth: 2, borderColor: theme.colors.border,
    padding: 16, marginBottom: 12, minHeight: 84,
  },
  rowOn: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brandLight },
  rowIcon: {
    width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.surfaceTertiary,
  },
  rowIconOn: { backgroundColor: theme.colors.surfaceSecondary },
  rowLabel: { fontSize: theme.font.md, fontWeight: "800", color: theme.colors.onSurface },
  rowDetail: { fontSize: theme.font.sm, color: theme.colors.onSurfaceSecondary, marginTop: 2, lineHeight: 21 },
  radio: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: theme.colors.borderStrong,
    alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceSecondary,
  },
  radioOn: { borderColor: theme.colors.brand },
  radioDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: theme.colors.brand },
  error: { fontSize: theme.font.base, color: theme.colors.error, fontWeight: "700", textAlign: "center", marginTop: 12 },

  footer: {
    paddingHorizontal: 20, paddingTop: 12, gap: 10,
    borderTopWidth: 1, borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  primary: { borderRadius: theme.radius.pill, paddingVertical: 20, alignItems: "center", minHeight: 64 },
  primaryText: { color: "#fff", fontSize: theme.font.md, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  secondary: { alignItems: "center", paddingVertical: 14, minHeight: 52, justifyContent: "center" },
  secondaryText: { fontSize: theme.font.base, fontWeight: "800", color: theme.colors.brand },
});
