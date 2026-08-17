import { useState } from "react";
import { Tabs, useRouter } from "expo-router";
import { View, Pressable, StyleSheet, Platform, ActivityIndicator, Linking } from "react-native";
import { AppText } from "@/src/components/AppText";
import { GradientFill } from "@/src/components/GradientFill";
import { GradientButton } from "@/src/components/GradientButton";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetch } from "@/src/api";
import { theme } from "@/src/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
const TABS: { name: string; label: string; icon: IconName; active: IconName; testID: string }[] = [
  { name: "index", label: "Home", icon: "home-outline", active: "home", testID: "tab-home" },
  { name: "health", label: "Health", icon: "heart-outline", active: "heart", testID: "tab-health" },
  { name: "content", label: "Watch", icon: "play-circle-outline", active: "play-circle", testID: "tab-content" },
  { name: "profile", label: "Profile", icon: "person-outline", active: "person", testID: "tab-profile" },
];

type SosResult = {
  delivered: boolean;
  message: string;
  contacts_notified: string[];
  emergency_number?: string;
};

type SosState =
  | { stage: "closed" }
  | { stage: "confirm" }
  | { stage: "sending" }
  | { stage: "done"; result: SosResult };

export default function ElderLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sos, setSos] = useState<SosState>({ stage: "closed" });

  const askSos = () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setSos({ stage: "confirm" });
  };

  const sendSos = async () => {
    setSos({ stage: "sending" });
    try {
      const r = await apiFetch<SosResult>("/sos", { method: "POST" });
      setSos({ stage: "done", result: r });
    } catch {
      setSos({
        stage: "done",
        result: {
          delivered: false,
          message: "We could not reach the network, so nobody was alerted. Please call for help directly.",
          contacts_notified: [],
          emergency_number: "112",
        },
      });
    }
  };

  const callEmergency = (number: string) => {
    Linking.openURL(`tel:${number}`).catch(() => {});
  };

  const tabBarBottom = insets.bottom > 0 ? insets.bottom : 12;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <Tabs
        screenOptions={{ headerShown: false, animation: "none" }}
        tabBar={({ state, navigation }) => (
          // The assistant and SOS live in reserved chrome rather than floating
          // over the screen, so they can never cover a medicine or a status.
          <View style={[styles.chrome, { paddingBottom: tabBarBottom }]} testID="elder-tabbar">
            <View style={styles.actionRow}>
              <GradientButton tone="brand"
                style={styles.assistantBtn}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                  router.push("/assistant");
                }}
                testID="floating-assistant"
                accessibilityRole="button"
                accessibilityLabel="Talk to Sunshine"
                accessibilityHint="Opens the assistant so you can ask for help by voice or typing"
              >
                <Ionicons name="mic" size={24} color="#fff" />
                <AppText style={styles.assistantText}>Ask Sunshine</AppText>
              </GradientButton>
              <GradientButton tone="danger"
                style={styles.sosBtn}
                onPress={askSos}
                testID="floating-sos"
                accessibilityRole="button"
                accessibilityLabel="Emergency SOS"
                accessibilityHint="Asks you to confirm before alerting your family"
              >
                <Ionicons name="alert" size={24} color="#fff" />
                <AppText style={styles.sosBtnText}>SOS</AppText>
              </GradientButton>
            </View>

            <View style={styles.bar}>
              {TABS.map((tab, index) => {
                const focused = state.index === index;
                return (
                  <Pressable
                    key={tab.name}
                    testID={tab.testID}
                    style={styles.item}
                    hitSlop={8}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: focused }}
                    accessibilityLabel={tab.label}
                    onPress={() => {
                      if (Platform.OS !== "web") Haptics.selectionAsync();
                      navigation.navigate(state.routes[index].name);
                    }}
                  >
                    <Ionicons name={focused ? tab.active : tab.icon} size={30} color={focused ? theme.colors.brand : theme.colors.muted} />
                    <AppText style={[styles.label, { color: focused ? theme.colors.brand : theme.colors.muted, fontWeight: focused ? "800" : "600" }]}>
                      {tab.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="health" />
        <Tabs.Screen name="content" />
        <Tabs.Screen name="profile" />
      </Tabs>

      {sos.stage !== "closed" && (
        <View style={styles.backdrop} testID="sos-sheet">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => sos.stage !== "sending" && setSos({ stage: "closed" })}
            accessibilityLabel="Close"
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />

            {sos.stage === "confirm" && (
              <>
                <View style={styles.sosBig}><GradientFill tone="danger" radius={42} /><Ionicons name="alert-circle" size={44} color="#fff" /></View>
                <AppText style={styles.sheetTitle}>Do you need help?</AppText>
                <AppText style={styles.sheetSub}>
                  We will alert the family connected to your account. You can close this if you tapped by mistake.
                </AppText>
                <GradientButton tone="danger"
                  style={styles.confirmBtn}
                  onPress={sendSos}
                  testID="sos-confirm"
                  accessibilityRole="button"
                  accessibilityLabel="Yes, alert my family"
                >
                  <AppText style={styles.confirmBtnText}>Yes, alert my family</AppText>
                </GradientButton>
                <Pressable
                  style={styles.cancelBtn}
                  onPress={() => setSos({ stage: "closed" })}
                  testID="sos-cancel"
                  accessibilityRole="button"
                  accessibilityLabel="No, I tapped by mistake"
                >
                  <AppText style={styles.cancelBtnText}>No, I&apos;m fine</AppText>
                </Pressable>
              </>
            )}

            {sos.stage === "sending" && (
              <>
                <View style={styles.sosBig}><Ionicons name="alert-circle" size={44} color="#fff" /></View>
                <AppText style={styles.sheetTitle}>Alerting your family…</AppText>
                <ActivityIndicator color={theme.colors.error} style={{ marginTop: 12 }} />
              </>
            )}

            {sos.stage === "done" && (
              <>
                <View style={[styles.sosBig, sos.result.delivered && { backgroundColor: theme.colors.success }]}><GradientFill tone={sos.result.delivered ? "success" : "danger"} radius={42} />
                  <Ionicons name={sos.result.delivered ? "shield-checkmark" : "warning"} size={44} color="#fff" />
                </View>
                <AppText style={styles.sheetTitle}>
                  {sos.result.delivered ? "Your family has been alerted" : "Nobody could be alerted"}
                </AppText>
                <AppText style={styles.sheetSub}>{sos.result.message}</AppText>

                {sos.result.contacts_notified.length > 0 && (
                  <View style={styles.contacts}>
                    {sos.result.contacts_notified.map((c) => (
                      <View key={c} style={styles.contactRow}>
                        <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
                        <AppText style={styles.contactText}>{c} was alerted</AppText>
                      </View>
                    ))}
                  </View>
                )}

                {sos.result.emergency_number && (
                  <GradientButton tone="danger"
                    style={styles.emergencyBtn}
                    onPress={() => callEmergency(sos.result.emergency_number!)}
                    testID="sos-call-emergency"
                    accessibilityRole="button"
                    accessibilityLabel={`Call emergency services on ${sos.result.emergency_number}`}
                  >
                    <Ionicons name="call" size={22} color="#fff" />
                    <AppText style={styles.emergencyBtnText}>Call {sos.result.emergency_number} now</AppText>
                  </GradientButton>
                )}

                <GradientButton tone="brand"
                  style={styles.okBtn}
                  onPress={() => setSos({ stage: "closed" })}
                  testID="sos-ok"
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <AppText style={styles.okBtnText}>Close</AppText>
                </GradientButton>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chrome: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  assistantBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.colors.brand, borderRadius: theme.radius.pill, paddingVertical: 14, minHeight: 56,
  },
  assistantText: { color: "#fff", fontSize: theme.font.base, fontWeight: "800" },
  sosBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.colors.error, borderRadius: theme.radius.pill,
    paddingVertical: 14, paddingHorizontal: 26, minHeight: 56,
  },
  sosBtnText: { color: "#fff", fontSize: theme.font.base, fontWeight: "800" },
  bar: { flexDirection: "row", paddingTop: 8, paddingHorizontal: 6 },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, minHeight: 56 },
  label: { fontSize: theme.font.xs },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, alignItems: "center", gap: 12 },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: theme.colors.borderStrong },
  sosBig: { width: 84, height: 84, borderRadius: 42, backgroundColor: theme.colors.error, alignItems: "center", justifyContent: "center", marginTop: 8 },
  sheetTitle: { fontSize: theme.font.lg, fontWeight: "800", color: theme.colors.onSurface, textAlign: "center" },
  sheetSub: { fontSize: theme.font.base, color: theme.colors.onSurfaceSecondary, textAlign: "center", lineHeight: 24 },
  contacts: { alignSelf: "stretch", backgroundColor: theme.colors.surfaceSecondary, borderRadius: 20, padding: 16, gap: 10, marginTop: 4 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  contactText: { fontSize: theme.font.base, fontWeight: "600", color: theme.colors.onSurface },
  confirmBtn: { alignSelf: "stretch", backgroundColor: theme.colors.error, borderRadius: theme.radius.pill, paddingVertical: 18, alignItems: "center", marginTop: 8, minHeight: 60 },
  confirmBtnText: { color: "#fff", fontSize: theme.font.md, fontWeight: "800" },
  cancelBtn: { alignSelf: "stretch", backgroundColor: theme.colors.surfaceTertiary, borderRadius: theme.radius.pill, paddingVertical: 18, alignItems: "center", minHeight: 60 },
  cancelBtnText: { color: theme.colors.onSurface, fontSize: theme.font.md, fontWeight: "700" },
  emergencyBtn: {
    alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: theme.colors.error, borderRadius: theme.radius.pill, paddingVertical: 18, marginTop: 8, minHeight: 60,
  },
  emergencyBtnText: { color: "#fff", fontSize: theme.font.md, fontWeight: "800" },
  okBtn: { alignSelf: "stretch", backgroundColor: theme.colors.brand, borderRadius: theme.radius.pill, paddingVertical: 18, alignItems: "center", minHeight: 60 },
  okBtnText: { color: "#fff", fontSize: theme.font.md, fontWeight: "800" },
});
