import { View, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { AppText } from "@/src/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { FeatureToggles } from "@/src/components/FeatureToggles";
import { useFeatures, LandingTab } from "@/src/features";
import { theme } from "@/src/theme";

/**
 * The elder changing their own mind, later — the same choices onboarding asked
 * for on the first run, including which tab opens first.
 */

const LANDING: { key: LandingTab; label: string; icon: any }[] = [
  { key: "home", label: "Home", icon: "home" },
  { key: "health", label: "Health", icon: "heart" },
  { key: "watch", label: "Watch", icon: "play-circle" },
  { key: "profile", label: "Profile", icon: "person" },
];

export default function MyAppSettings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { features, save } = useFeatures();

  const options = LANDING.filter((o) => o.key !== "watch" || features.watch_tab_enabled);

  const pick = async (key: LandingTab) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    try { await save({ preferred_landing_tab: key }); } catch {}
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]} testID="my-app-settings">
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.hBtn}
          testID="my-app-settings-back"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={28} color={theme.colors.onSurface} />
        </Pressable>
        <AppText style={styles.hTitle}>What&apos;s on my app</AppText>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <AppText style={styles.intro}>
          Switch off anything you would rather not have. Nothing here affects the SOS button, Sunshine, or calling your family — those are always there.
        </AppText>

        <FeatureToggles testID="elder-feature-toggles" />

        <AppText style={styles.section}>Open first on</AppText>
        <AppText style={styles.sectionSub}>The screen you see when you open Sunshine.</AppText>
        <View style={styles.landingRows}>
          {options.map((o) => {
            const on = features.preferred_landing_tab === o.key;
            return (
              <Pressable
                key={o.key}
                style={[styles.landingRow, on && styles.landingRowOn]}
                onPress={() => pick(o.key)}
                testID={`landing-${o.key}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={o.label}
              >
                <Ionicons name={o.icon} size={22} color={on ? theme.colors.brand : theme.colors.muted} />
                <AppText style={[styles.landingLabel, on && styles.landingLabelOn]}>{o.label}</AppText>
                <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  hBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  hTitle: { flex: 1, textAlign: "center", fontSize: theme.font.lg, fontWeight: "800", color: theme.colors.onSurface },
  intro: { fontSize: theme.font.base, color: theme.colors.onSurfaceSecondary, lineHeight: 26, marginBottom: 18 },
  section: { fontSize: theme.font.md, fontWeight: "800", color: theme.colors.onSurface, marginTop: 28 },
  sectionSub: { fontSize: theme.font.sm, color: theme.colors.muted, marginTop: 2, marginBottom: 12 },
  landingRows: {
    backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden",
  },
  landingRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, minHeight: 64 },
  landingRowOn: { backgroundColor: theme.colors.brandLight },
  landingLabel: { flex: 1, fontSize: theme.font.base, fontWeight: "700", color: theme.colors.onSurface },
  landingLabelOn: { fontWeight: "800" },
  radio: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: theme.colors.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  radioOn: { borderColor: theme.colors.brand },
  radioDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: theme.colors.brand },
});
