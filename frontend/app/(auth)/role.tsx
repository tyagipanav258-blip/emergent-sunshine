import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Logo } from "@/src/components/Logo";
import { theme } from "@/src/theme";

export default function RoleChooser() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const go = (path: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    router.push(path as any);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]} testID="role-chooser">
      <View style={styles.top}>
        <Logo size={84} subtitle="Warmth, family & wellbeing" />
        <Text style={styles.tagline}>Welcome! Who is using Sunshine?</Text>
      </View>

      <View style={styles.choices}>
        <Pressable style={[styles.card, styles.cardElder]} onPress={() => go("/(auth)/elder-login")} testID="choose-elder">
          <View style={[styles.iconWrap, { backgroundColor: theme.colors.marigoldLight }]}>
            <Ionicons name="happy" size={44} color={theme.colors.marigoldDark} />
          </View>
          <Text style={styles.cardTitle}>I am using this for myself</Text>
          <Text style={styles.cardSub}>Log in with your phone number and PIN</Text>
          <View style={styles.arrow}><Ionicons name="arrow-forward" size={26} color={theme.colors.brand} /></View>
        </Pressable>

        <Pressable style={[styles.card, styles.cardChild]} onPress={() => go("/(auth)/child-login")} testID="choose-child">
          <View style={[styles.iconWrap, { backgroundColor: theme.colors.brandLight }]}>
            <Ionicons name="people" size={40} color={theme.colors.brand} />
          </View>
          <Text style={styles.cardTitle}>I am a family member</Text>
          <Text style={styles.cardSub}>Care for your parent with email login</Text>
          <View style={styles.arrow}><Ionicons name="arrow-forward" size={26} color={theme.colors.brand} /></View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface, paddingHorizontal: 24, justifyContent: "space-between" },
  top: { gap: 24, alignItems: "flex-start" },
  tagline: { fontSize: 24, fontWeight: "700", color: theme.colors.onSurface, lineHeight: 32 },
  choices: { gap: 18, marginBottom: 20 },
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
  cardSub: { fontSize: 16, color: theme.colors.muted, marginTop: 6, lineHeight: 22 },
  arrow: { position: "absolute", right: 24, bottom: 24, width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.brandLight, alignItems: "center", justifyContent: "center" },
});
