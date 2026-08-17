import { useState } from "react";
import { View, StyleSheet, Pressable, Platform, Linking, ActivityIndicator } from "react-native";
import { AppText } from "@/src/components/AppText";
import { GradientButton } from "@/src/components/GradientButton";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { usePush } from "@/src/hooks/use-push";
import { sendTestPush } from "@/src/push";
import { theme } from "@/src/theme";

/**
 * Tells the user, in their own words, whether this phone will actually ring —
 * and lets them prove it rather than find out during an emergency.
 *
 * Every state here is honest about what it can and cannot do. "Alerts are on"
 * is only ever shown once a token has been accepted by the server.
 */
const COPY: Record<string, { icon: any; tone: "good" | "warn" | "off"; title: string; body: string }> = {
  ready: {
    icon: "notifications", tone: "good",
    title: "Alerts are on",
    body: "This phone will ring for emergencies and reminders, even when Sunshine is closed.",
  },
  denied: {
    icon: "notifications-off", tone: "warn",
    title: "Alerts are turned off",
    body: "Sunshine can only reach you inside the app. Turn on notifications in Settings so an emergency can reach this phone.",
  },
  unsupported: {
    icon: "phone-portrait-outline", tone: "off",
    title: "Alerts need the phone app",
    body: "Notifications do not work in a web browser or a simulator. Everything still appears in Updates.",
  },
  "needs-build": {
    icon: "construct-outline", tone: "off",
    title: "Alerts need the installed app",
    body: "Expo Go cannot receive alerts. Install the built app and they will switch on by themselves.",
  },
  unconfigured: {
    icon: "alert-circle-outline", tone: "warn",
    title: "Alerts are not set up yet",
    body: "This build has no push project configured, so no alert can be sent to it.",
  },
  failed: {
    icon: "cloud-offline-outline", tone: "warn",
    title: "Could not turn alerts on",
    body: "Something went wrong registering this phone. Tap to try again.",
  },
  idle: {
    icon: "notifications-outline", tone: "off",
    title: "Checking alerts…",
    body: "One moment.",
  },
};

export function AlertSettings({ testID = "alert-settings" }: { testID?: string }) {
  const push = usePush();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const copy = COPY[push.status] || COPY.idle;
  const tint = copy.tone === "good" ? theme.colors.success
    : copy.tone === "warn" ? theme.colors.error
      : theme.colors.muted;

  const test = async () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setBusy(true);
    setSent(null);
    try {
      const r = await sendTestPush();
      setSent(r.ok ? "Sent — it should arrive in a moment." : "Nothing was delivered. Check the alert settings on this phone.");
    } catch {
      setSent("Could not send a test alert just now.");
    }
    setBusy(false);
  };

  const retry = async () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setBusy(true);
    await push.register();
    setBusy(false);
  };

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: tint + "1F" }]}>
          <Ionicons name={copy.icon} size={22} color={tint} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText style={styles.title} testID="alert-status">{copy.title}</AppText>
          <AppText style={styles.body}>{copy.body}</AppText>
        </View>
      </View>

      {push.status === "denied" && (
        <Pressable style={styles.link} onPress={() => Linking.openSettings()} testID="alert-open-settings"
          accessibilityRole="button" accessibilityLabel="Open notification settings for Sunshine">
          <AppText style={styles.linkText}>Open Settings</AppText>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.brand} />
        </Pressable>
      )}

      {push.status === "failed" && (
        <Pressable style={styles.link} onPress={retry} testID="alert-retry"
          accessibilityRole="button" accessibilityLabel="Try turning alerts on again">
          <AppText style={styles.linkText}>{busy ? "Trying…" : "Try again"}</AppText>
          <Ionicons name="refresh" size={18} color={theme.colors.brand} />
        </Pressable>
      )}

      {push.status === "ready" && (
        <GradientButton tone="brand" style={styles.testBtn} onPress={test} disabled={busy}
          testID="alert-test" accessibilityRole="button"
          accessibilityLabel="Send a test alert to this phone"
          accessibilityHint="Sends one notification so you can check it arrives">
          {busy ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="paper-plane" size={20} color="#fff" />
              <AppText style={styles.testText}>Send a test alert</AppText>
            </>
          )}
        </GradientButton>
      )}

      {sent && <AppText style={styles.sent} testID="alert-test-result">{sent}</AppText>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border, padding: 16, gap: 12,
    marginHorizontal: 20,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  title: { fontSize: theme.font.base, fontWeight: "800", color: theme.colors.onSurface },
  body: { fontSize: theme.font.sm, color: theme.colors.onSurfaceSecondary, lineHeight: 21, marginTop: 3 },
  link: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
  linkText: { fontSize: theme.font.sm, fontWeight: "800", color: theme.colors.brand },
  testBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderRadius: 999, paddingVertical: 15, minHeight: 52,
  },
  testText: { color: "#fff", fontSize: theme.font.base, fontWeight: "800" },
  sent: { fontSize: theme.font.sm, color: theme.colors.onSurfaceSecondary, lineHeight: 20 },
});
