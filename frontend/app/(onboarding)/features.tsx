import { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { AppText } from "@/src/components/AppText";
import { GradientButton } from "@/src/components/GradientButton";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { LogoMark } from "@/src/components/Logo";
import { WATCH_CATEGORY_CHOICES } from "@/src/features";
import { theme } from "@/src/theme";

/** Screen 1 of first run: what should be on this app at all. */

type FlagKey =
  | "watch_tab_enabled"
  | "concierge_tab_enabled"
  | "prescription_scan_enabled"
  | "medicine_explainer_enabled"
  | "appointments_enabled";

const CHOICES: { key: FlagKey; label: string; detail: string; icon: any }[] = [
  { key: "watch_tab_enabled", label: "Watch", detail: "Reels and videos to enjoy", icon: "play-circle" },
  { key: "concierge_tab_enabled", label: "Care & Concierge requests", detail: "Ask us to arrange a refill, a doctor or a taxi", icon: "sparkles" },
  { key: "prescription_scan_enabled", label: "Prescription photo scan", detail: "Take a photo and we add your medicines for you", icon: "camera" },
  { key: "medicine_explainer_enabled", label: "Medicine explanations", detail: "What a medicine is for, in plain language", icon: "information-circle" },
  { key: "appointments_enabled", label: "Appointments", detail: "Your upcoming doctor visits", icon: "calendar" },
];

export default function OnboardingFeatures() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Everything starts on. An elder who taps straight through keeps the whole app.
  const [flags, setFlags] = useState<Record<FlagKey, boolean>>({
    watch_tab_enabled: true,
    concierge_tab_enabled: true,
    prescription_scan_enabled: true,
    medicine_explainer_enabled: true,
    appointments_enabled: true,
  });
  const [cats, setCats] = useState<string[]>([...WATCH_CATEGORY_CHOICES]);

  const tap = () => { if (Platform.OS !== "web") Haptics.selectionAsync(); };

  const toggle = (k: FlagKey) => {
    tap();
    setFlags((p) => ({ ...p, [k]: !p[k] }));
  };

  const toggleCat = (c: string) => {
    tap();
    setCats((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  };

  // Handing on an empty list would mean a Watch tab with nothing in it, so the
  // last subject cannot be unticked while Watch itself is on.
  const catsValid = !flags.watch_tab_enabled || cats.length > 0;

  const go = (payload: { flags: Record<FlagKey, boolean>; cats: string[] }) => {
    router.push({
      pathname: "/(onboarding)/landing",
      params: {
        ...Object.fromEntries(Object.entries(payload.flags).map(([k, v]) => [k, v ? "1" : "0"])),
        watch_categories: payload.cats.join(","),
      },
    });
  };

  const useEverything = () => {
    tap();
    const all: Record<FlagKey, boolean> = {
      watch_tab_enabled: true,
      concierge_tab_enabled: true,
      prescription_scan_enabled: true,
      medicine_explainer_enabled: true,
      appointments_enabled: true,
    };
    setFlags(all);
    setCats([...WATCH_CATEGORY_CHOICES]);
    go({ flags: all, cats: [...WATCH_CATEGORY_CHOICES] });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]} testID="onboarding-features">
      <View style={styles.header}>
        <LogoMark size={44} />
        <AppText style={styles.step}>Step 1 of 2</AppText>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <AppText style={styles.title}>What would you like on your app?</AppText>
        <AppText style={styles.sub}>
          Everything is switched on already. Untick anything you would rather not have — you can change this later.
        </AppText>

        {CHOICES.map((c) => {
          const on = flags[c.key];
          return (
            <Pressable
              key={c.key}
              style={[styles.row, on && styles.rowOn]}
              onPress={() => toggle(c.key)}
              testID={`onb-${c.key}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${c.label}. ${c.detail}`}
            >
              <View style={[styles.rowIcon, on && styles.rowIconOn]}>
                <Ionicons name={c.icon} size={26} color={on ? theme.colors.brand : theme.colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText style={styles.rowLabel}>{c.label}</AppText>
                <AppText style={styles.rowDetail}>{c.detail}</AppText>
              </View>
              <View style={[styles.box, on && styles.boxOn]}>
                {on && <Ionicons name="checkmark" size={24} color="#fff" />}
              </View>
            </Pressable>
          );
        })}

        {flags.watch_tab_enabled && (
          <View style={styles.catBlock} testID="onb-watch-categories">
            <AppText style={styles.catTitle}>Which videos would you like to see?</AppText>
            <AppText style={styles.catSub}>Pick as many as you like.</AppText>
            <View style={styles.chips}>
              {WATCH_CATEGORY_CHOICES.map((c) => {
                const on = cats.includes(c);
                return (
                  <Pressable
                    key={c}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => toggleCat(c)}
                    testID={`onb-cat-${c}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={c}
                  >
                    {on && <Ionicons name="checkmark" size={18} color="#fff" />}
                    <AppText style={[styles.chipText, on && styles.chipTextOn]}>{c}</AppText>
                  </Pressable>
                );
              })}
            </View>
            {!catsValid && (
              <AppText style={styles.warn} accessibilityRole="alert">
                Please keep at least one kind of video, or untick Watch above.
              </AppText>
            )}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <GradientButton
          tone="brand"
          style={[styles.primary, !catsValid && styles.disabled]}
          disabled={!catsValid}
          onPress={() => { tap(); go({ flags, cats }); }}
          testID="onb-continue"
          accessibilityRole="button"
          accessibilityLabel="Continue"
        >
          <AppText style={styles.primaryText}>Continue</AppText>
        </GradientButton>

        <Pressable
          onPress={useEverything}
          style={styles.secondary}
          testID="onb-use-everything"
          accessibilityRole="button"
          accessibilityLabel="Use everything, keep all the suggestions"
        >
          <AppText style={styles.secondaryText}>Use everything</AppText>
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
  box: {
    width: 34, height: 34, borderRadius: 10, borderWidth: 2, borderColor: theme.colors.borderStrong,
    alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceSecondary,
  },
  boxOn: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },

  catBlock: {
    marginTop: 10, padding: 16, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceTertiary,
  },
  catTitle: { fontSize: theme.font.md, fontWeight: "800", color: theme.colors.onSurface },
  catSub: { fontSize: theme.font.sm, color: theme.colors.muted, marginTop: 2, marginBottom: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 2, borderColor: theme.colors.border, minHeight: 48,
  },
  chipOn: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  chipText: { fontSize: theme.font.base, fontWeight: "700", color: theme.colors.onSurface },
  chipTextOn: { color: "#fff" },
  warn: { fontSize: theme.font.sm, color: theme.colors.error, fontWeight: "700", marginTop: 12 },

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
