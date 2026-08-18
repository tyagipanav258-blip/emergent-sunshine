import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { AppText } from "@/src/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FeatureToggles, LandingSummary } from "@/src/components/FeatureToggles";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";

/**
 * The family managing the elder's app for them — for the elders who would
 * rather someone else did this than hunt through settings themselves.
 *
 * The landing tab is shown but not editable here: it is the elder's own choice
 * about where their app opens, and the family only needs to understand it.
 */
export default function ManageApp() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const parent = user?.elder_name || "your parent";

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]} testID="manage-app">
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.hBtn}
          testID="manage-app-back"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={28} color={theme.colors.onSurface} />
        </Pressable>
        <AppText style={styles.hTitle} numberOfLines={1}>Manage {parent}&apos;s app</AppText>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <AppText style={styles.intro}>
          What {parent} sees on their phone. They can change these themselves too. The SOS button, Sunshine and calling you are always on — they can never be switched off from here.
        </AppText>

        <FeatureToggles testID="family-feature-toggles" />

        <AppText style={styles.section}>Where their app opens</AppText>
        <AppText style={styles.sectionSub}>
          Chosen during setup. They can change it in their own settings.
        </AppText>
        <LandingSummary compact />
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
  hTitle: { flex: 1, textAlign: "center", fontSize: theme.font.md, fontWeight: "800", color: theme.colors.onSurface },
  intro: { fontSize: theme.font.base, color: theme.colors.onSurfaceSecondary, lineHeight: 26, marginBottom: 18 },
  section: { fontSize: theme.font.md, fontWeight: "800", color: theme.colors.onSurface, marginTop: 28 },
  sectionSub: { fontSize: theme.font.sm, color: theme.colors.muted, marginTop: 2, marginBottom: 12 },
});
