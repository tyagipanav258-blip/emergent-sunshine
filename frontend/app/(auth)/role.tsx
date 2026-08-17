import { View, StyleSheet, Pressable, Platform, ScrollView } from "react-native";
import { AppText } from "@/src/components/AppText";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { AuthHero, AuthBackground } from "@/src/components/AuthHero";
import { KAMALA_PHOTO, FAMILY_PHOTO } from "@/src/constants/personas";
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
      <AuthBackground />
      <AuthHero
        icon="sunny"
        title="Welcome to Sunshine"
        subtitle="Warmth, family & wellbeing"
        insetTop={insets.top}
      />
      <View style={[styles.sheet, { marginBottom: insets.bottom + 16 }]}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <AppText style={styles.tagline}>Who is using Sunshine today?</AppText>

          <View style={styles.choices}>
            <Pressable
              style={[styles.card, styles.cardElder]}
              onPress={() => go("/(auth)/elder-login")}
              testID="choose-elder"
              accessibilityRole="button"
              accessibilityLabel="Parent"
              accessibilityHint="Log in with your phone number and PIN"
            >
              <View style={[styles.iconWrap, { backgroundColor: theme.colors.marigoldLight }]}>
                <Image source={{ uri: KAMALA_PHOTO }} style={styles.iconPhoto} contentFit="cover" />
              </View>
              <AppText style={styles.cardTitle}>Parent</AppText>
              <View style={styles.arrow}><Ionicons name="arrow-forward" size={24} color={theme.colors.brand} /></View>
            </Pressable>

            <Pressable
              style={[styles.card, styles.cardChild]}
              onPress={() => go("/(auth)/child-login")}
              testID="choose-child"
              accessibilityRole="button"
              accessibilityLabel="Child"
              accessibilityHint="Care for your parent with an email login"
            >
              <View style={[styles.iconWrap, { backgroundColor: theme.colors.brandLight }]}>
                <Image source={{ uri: FAMILY_PHOTO }} style={styles.iconPhoto} contentFit="cover" />
              </View>
              <AppText style={styles.cardTitle}>Child</AppText>
              <View style={styles.arrow}><Ionicons name="arrow-forward" size={24} color={theme.colors.brand} /></View>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  sheet: {
    flex: 1, marginHorizontal: 16, borderRadius: 32,
    backgroundColor: theme.colors.surface, overflow: "hidden",
  },
  body: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 },
  tagline: { fontSize: 18, fontWeight: "700", color: theme.colors.onSurface, marginBottom: 16 },
  choices: { gap: 14 },
  card: {
    flexDirection: "row", alignItems: "center", gap: 16,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 24,
    padding: 14,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  cardElder: { borderColor: theme.colors.marigold },
  cardChild: {},
  iconWrap: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 },
  iconPhoto: { width: "100%", height: "100%" },
  cardTitle: { flex: 1, fontSize: 20, fontWeight: "800", color: theme.colors.onSurface },
  arrow: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.brandLight, alignItems: "center", justifyContent: "center", flexShrink: 0 },
});
