import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Switch } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { theme, API } from "@/src/theme";

const ROWS = [
  { icon: "people", label: "Family connections", sub: "Priya, Rahul & 3 more", testID: "row-family" },
  { icon: "bookmark", label: "Saved videos", sub: "12 saved", testID: "row-saved-videos" },
  { icon: "newspaper", label: "Saved news", sub: "5 articles", testID: "row-saved-news" },
  { icon: "eye", label: "Accessibility", sub: "Text size, contrast", testID: "row-accessibility" },
  { icon: "notifications", label: "Notifications", sub: "Reminders & alerts", testID: "row-notifications" },
  { icon: "shield-checkmark", label: "Family sharing", sub: "Consent & permissions", testID: "row-sharing" },
  { icon: "help-circle", label: "Help & support", sub: "We're here to help", testID: "row-help" },
] as const;

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [okayState, setOkayState] = useState<"idle" | "sending" | "done">("idle");
  const [largeText, setLargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  const sendImOkay = async () => {
    if (okayState !== "idle") return;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setOkayState("sending");
    try {
      await fetch(`${API}/im-okay`, { method: "POST" });
    } catch {}
    setOkayState("done");
    setTimeout(() => setOkayState("idle"), 2500);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="profile-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Image
            source={{ uri: "https://images.unsplash.com/photo-1590905707155-17c680dd7867?w=400&q=80" }}
            style={styles.headerAvatar}
          />
          <Text style={styles.name}>Kamala Iyer</Text>
          <Text style={styles.sub}>Bangalore, India</Text>
        </View>

        {/* I'm Okay */}
        <Pressable
          onPress={sendImOkay}
          style={[
            styles.okayBtn,
            okayState === "done" && { backgroundColor: theme.colors.success },
          ]}
          testID="im-okay-btn"
        >
          <View style={styles.okayIcon}>
            <Ionicons
              name={okayState === "done" ? "checkmark-circle" : "sunny"}
              size={30}
              color="#fff"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.okayTitle}>
              {okayState === "done" ? "Family notified" : "I'm Okay"}
            </Text>
            <Text style={styles.okaySub}>
              {okayState === "sending" ? "Sending..." :
                okayState === "done" ? "Your family knows you're doing well" :
                  "One tap to reassure your family"}
            </Text>
          </View>
        </Pressable>

        {/* Quick accessibility */}
        <Text style={styles.sectionTitle}>Quick Accessibility</Text>
        <View style={styles.toggleCard}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleIcon}><Ionicons name="text" size={22} color={theme.colors.brand} /></View>
            <Text style={styles.toggleLabel}>Larger text</Text>
            <Switch
              value={largeText}
              onValueChange={setLargeText}
              trackColor={{ true: theme.colors.brand, false: theme.colors.borderStrong }}
              thumbColor="#fff"
              testID="toggle-large-text"
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <View style={styles.toggleIcon}><Ionicons name="contrast" size={22} color={theme.colors.brand} /></View>
            <Text style={styles.toggleLabel}>Higher contrast</Text>
            <Switch
              value={highContrast}
              onValueChange={setHighContrast}
              trackColor={{ true: theme.colors.brand, false: theme.colors.borderStrong }}
              thumbColor="#fff"
              testID="toggle-contrast"
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.rowsCard}>
          {ROWS.map((r, i) => (
            <View key={r.label}>
              <Pressable style={styles.settingRow} testID={r.testID}>
                <View style={styles.settingIcon}>
                  <Ionicons name={r.icon as any} size={24} color={theme.colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>{r.label}</Text>
                  <Text style={styles.settingSub}>{r.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={theme.colors.muted} />
              </Pressable>
              {i < ROWS.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        <Text style={styles.footer}>Sunshine — made with care ☀️</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: { alignItems: "center", paddingTop: 20, paddingBottom: 8 },
  headerAvatar: {
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 4, borderColor: theme.colors.brandLight,
  },
  name: { fontSize: 26, fontWeight: "800", color: theme.colors.onSurface, marginTop: 14 },
  sub: { fontSize: 16, color: theme.colors.muted, marginTop: 2 },

  okayBtn: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: theme.colors.brand,
    borderRadius: 24,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: theme.colors.brand,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  okayIcon: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center", justifyContent: "center",
  },
  okayTitle: { color: "#fff", fontSize: 22, fontWeight: "800" },
  okaySub: { color: "rgba(255,255,255,0.92)", fontSize: 15, marginTop: 2 },

  sectionTitle: { fontSize: 22, fontWeight: "800", color: theme.colors.onSurface, paddingHorizontal: 20, marginTop: 28, marginBottom: 12 },
  toggleCard: {
    marginHorizontal: 20,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 24,
    paddingHorizontal: 16,
  },
  toggleRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 16,
  },
  toggleIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: theme.colors.brandLight,
    alignItems: "center", justifyContent: "center",
  },
  toggleLabel: { flex: 1, fontSize: 18, fontWeight: "700", color: theme.colors.onSurface },
  divider: { height: 1, backgroundColor: theme.colors.border, marginLeft: 58 },

  rowsCard: {
    marginHorizontal: 20,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 24,
    paddingHorizontal: 16,
  },
  settingRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 16, minHeight: 60,
  },
  settingIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: theme.colors.brandLight,
    alignItems: "center", justifyContent: "center",
  },
  settingLabel: { fontSize: 18, fontWeight: "700", color: theme.colors.onSurface },
  settingSub: { fontSize: 14, color: theme.colors.muted, marginTop: 2 },

  footer: { textAlign: "center", color: theme.colors.muted, fontSize: 15, marginTop: 32 },
});
