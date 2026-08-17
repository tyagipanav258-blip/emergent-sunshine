import { View, StyleSheet, Pressable, Platform, ScrollView } from "react-native";
import { AppText } from "@/src/components/AppText";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AuthHero } from "@/src/components/AuthHero";
import { theme } from "@/src/theme";

export default function RoleChooser() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const go = (path: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    router.push(path as any);
  };

  return (
    <View style={styles.root} testID="role-chooser">
      <AuthHero
        icon="sunny"
        title="Welcome to Sunshine"
        subtitle="Warmth, family & wellbeing"
        insetTop={insets.top}
      />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <AppText style={styles.tagline}>Who is using Sunshine today?</AppText>

        <View style={styles.choices}>
          <Pressable
            style={[styles.card, styles.cardElder]}
            onPress={() => go("/(auth)/elder-login")}
            testID="choose-elder"
            accessibilityRole="button"
            accessibilityLabel="I am using this for myself"
            accessibilityHint="Log in with your phone number and PIN"
          >
            <View style={[styles.iconWrap, { backgroundColor: theme.colors.marigoldLight }]}>
              <Ionicons name="happy" size={44} color={theme.colors.marigoldDark} />
            </View>
            <AppText style={styles.cardTitle}>I am using this for myself</AppText>
            <View style={styles.cardFoot}>
              <AppText style={styles.cardSub}>Log in with your phone number and PIN</AppText>
              <View style={styles.arrow}><Ionicons name="arrow-forward" size={26} color={theme.colors.brand} /></View>
            </View>
          </Pressable>

          <Pressable
            style={[styles.card, styles.cardChild]}
            onPress={() => go("/(auth)/child-login")}
            testID="choose-child"
            accessibilityRole="button"
            accessibilityLabel="I am a family member"
            accessibilityHint="Care for your parent with an email login"
          >
            <View style={[styles.iconWrap, { backgroundColor: theme.colors.brandLight }]}>
              <Ionicons name="people" size={40} color={theme.colors.brand} />
            </View>
            <AppText style={styles.cardTitle}>I am a family member</AppText>
            <View style={styles.cardFoot}>
              <AppText style={styles.cardSub}>Care for your parent with email login</AppText>
              <View style={styles.arrow}><Ionicons name="arrow-forward" size={26} color={theme.colors.brand} /></View>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  body: { paddingHorizontal: 24, paddingTop: 28 },
  tagline: { fontSize: 20, fontWeight: "700", color: theme.colors.onSurface, marginBottom: 18 },
  choices: { gap: 18 },
  card: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 28,
    padding: 24,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  cardElder: { borderColor: theme.colors.marigold },
  cardChild: {},
  iconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  cardTitle: { fontSize: 22, fontWeight: "800", color: theme.colors.onSurface },
  cardSub: { flex: 1, fontSize: 16, color: theme.colors.muted, lineHeight: 22 },
  cardFoot: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 },
  arrow: { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.brandLight, alignItems: "center", justifyContent: "center", flexShrink: 0 },
});
