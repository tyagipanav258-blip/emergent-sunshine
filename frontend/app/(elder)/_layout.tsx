import { useState } from "react";
import { Tabs, useRouter } from "expo-router";
import { View, Text, Pressable, StyleSheet, Platform, ActivityIndicator } from "react-native";
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

export default function ElderLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sos, setSos] = useState<{ open: boolean; result?: any }>({ open: false });

  const triggerSos = async () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setSos({ open: true });
    try {
      const j = await apiFetch("/sos", { method: "POST" });
      setSos({ open: true, result: j });
    } catch {
      setSos({ open: true, result: { message: "Could not reach network. Please try again." } });
    }
  };

  const tabBarBottom = insets.bottom > 0 ? insets.bottom : 12;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <Tabs
        screenOptions={{ headerShown: false, animation: "none" }}
        tabBar={({ state, navigation }) => (
          <View style={[styles.bar, { paddingBottom: tabBarBottom }]} testID="elder-tabbar">
            {TABS.map((tab, index) => {
              const focused = state.index === index;
              return (
                <Pressable
                  key={tab.name}
                  testID={tab.testID}
                  style={styles.item}
                  hitSlop={8}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.selectionAsync();
                    navigation.navigate(state.routes[index].name);
                  }}
                >
                  <Ionicons name={focused ? tab.active : tab.icon} size={30} color={focused ? theme.colors.brand : theme.colors.muted} />
                  <Text style={[styles.label, { color: focused ? theme.colors.brand : theme.colors.muted, fontWeight: focused ? "800" : "600" }]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="health" />
        <Tabs.Screen name="content" />
        <Tabs.Screen name="profile" />
      </Tabs>

      {/* Floating Voice Assistant (left) */}
      <Pressable
        style={[styles.fab, styles.fabVoice, { bottom: tabBarBottom + 78 }]}
        onPress={() => { if (Platform.OS !== "web") Haptics.selectionAsync(); router.push("/assistant"); }}
        testID="floating-assistant"
      >
        <Ionicons name="mic" size={26} color="#fff" />
      </Pressable>

      {/* Floating SOS (right) */}
      <Pressable
        style={[styles.fab, styles.fabSos, { bottom: tabBarBottom + 78 }]}
        onPress={triggerSos}
        testID="floating-sos"
      >
        <Ionicons name="alert" size={28} color="#fff" />
        <Text style={styles.sosText}>SOS</Text>
      </Pressable>

      {sos.open && (
        <View style={styles.backdrop} testID="sos-sheet">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => sos.result && setSos({ open: false })} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sosBig}>
              <Ionicons name={sos.result ? "shield-checkmark" : "alert-circle"} size={44} color="#fff" />
            </View>
            <Text style={styles.sheetTitle}>{sos.result ? "Help is on the way" : "Alerting your family..."}</Text>
            <Text style={styles.sheetSub}>{sos.result?.message || "Please stay calm. Contacting family and doctor."}</Text>
            {!sos.result && <ActivityIndicator color={theme.colors.error} style={{ marginTop: 12 }} />}
            {sos.result?.contacts_notified && (
              <View style={styles.contacts}>
                {sos.result.contacts_notified.map((c: string) => (
                  <View key={c} style={styles.contactRow}>
                    <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
                    <Text style={styles.contactText}>{c} notified</Text>
                  </View>
                ))}
              </View>
            )}
            <Pressable style={[styles.okBtn, !sos.result && { opacity: 0.5 }]} disabled={!sos.result} onPress={() => setSos({ open: false })} testID="sos-ok">
              <Text style={styles.okBtnText}>{sos.result ? "OK, thank you" : "Please wait..."}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", backgroundColor: theme.colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 10, paddingHorizontal: 6 },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, minHeight: 56 },
  label: { fontSize: 13 },
  fab: {
    position: "absolute", alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  fabVoice: { left: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.brand },
  fabSos: { right: 20, width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.error, gap: 0 },
  sosText: { color: "#fff", fontSize: 11, fontWeight: "800", marginTop: -2 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, alignItems: "center", gap: 12 },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: theme.colors.borderStrong },
  sosBig: { width: 84, height: 84, borderRadius: 42, backgroundColor: theme.colors.error, alignItems: "center", justifyContent: "center", marginTop: 8 },
  sheetTitle: { fontSize: 24, fontWeight: "800", color: theme.colors.onSurface, textAlign: "center" },
  sheetSub: { fontSize: 17, color: theme.colors.onSurfaceSecondary, textAlign: "center", lineHeight: 24 },
  contacts: { alignSelf: "stretch", backgroundColor: theme.colors.surfaceSecondary, borderRadius: 20, padding: 16, gap: 10, marginTop: 4 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  contactText: { fontSize: 17, fontWeight: "600", color: theme.colors.onSurface },
  okBtn: { alignSelf: "stretch", backgroundColor: theme.colors.brand, borderRadius: 999, paddingVertical: 18, alignItems: "center", marginTop: 8 },
  okBtnText: { color: "#fff", fontSize: 18, fontWeight: "800" },
});
