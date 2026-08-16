import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Switch, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { apiFetch } from "@/src/api";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";

type Task = { id: string; kind: string; title: string; detail: string; status: string; timeline: any[] };

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  requested: { label: "Requested", color: theme.colors.marigoldDark, icon: "hourglass" },
  approved: { label: "Approved by family", color: theme.colors.info, icon: "thumbs-up" },
  in_progress: { label: "In progress", color: theme.colors.brand, icon: "sync" },
  done: { label: "Done", color: theme.colors.success, icon: "checkmark-circle" },
  declined: { label: "Not possible", color: theme.colors.error, icon: "close-circle" },
};

export default function ElderProfile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [largeText, setLargeText] = useState(false);
  const [okay, setOkay] = useState<"idle" | "done">("idle");

  const load = useCallback(async () => {
    try { setTasks(await apiFetch<Task[]>("/concierge/tasks")); } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sendOkay = async () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setOkay("done");
    try { await apiFetch("/im-okay", { method: "POST" }); } catch {}
    setTimeout(() => setOkay("idle"), 2500);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="elder-profile">
      <ScrollView contentContainerStyle={{ paddingBottom: 200 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Image source={{ uri: "https://images.unsplash.com/photo-1590905707155-17c680dd7867?w=400&q=80" }} style={styles.avatar} />
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.sub}>{user?.location || "India"}</Text>
        </View>

        {/* Family code */}
        <View style={styles.codeCard} testID="family-code-card">
          <View style={{ flex: 1 }}>
            <Text style={styles.codeLabel}>Your family code</Text>
            <Text style={styles.codeValue}>{user?.family_code}</Text>
            <Text style={styles.codeHint}>Share this with your son or daughter so they can connect.</Text>
          </View>
          <Ionicons name="people-circle" size={44} color={theme.colors.brand} />
        </View>

        {/* I'm Okay */}
        <Pressable style={[styles.okay, okay === "done" && { backgroundColor: theme.colors.success }]} onPress={sendOkay} testID="im-okay-btn">
          <View style={styles.okayIcon}><Ionicons name={okay === "done" ? "checkmark-circle" : "sunny"} size={30} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.okayTitle}>{okay === "done" ? "Family notified" : "I'm Okay"}</Text>
            <Text style={styles.okaySub}>{okay === "done" ? "They know you're doing well" : "One tap to reassure your family"}</Text>
          </View>
        </Pressable>

        {/* Quick call */}
        <Text style={styles.section}>Stay Connected</Text>
        <View style={styles.callRow}>
          <CallBtn name="Priya" who="daughter" icon="woman" onPress={() => router.push({ pathname: "/call", params: { name: "Priya", who: "daughter" } })} />
          <CallBtn name="Rahul" who="son" icon="man" onPress={() => router.push({ pathname: "/call", params: { name: "Rahul", who: "son" } })} />
          <CallBtn name="Doctor" who="doctor" icon="medkit" onPress={() => router.push({ pathname: "/call", params: { name: "Dr. Sharma", who: "doctor" } })} />
        </View>

        {/* My Requests (concierge) */}
        <Text style={styles.section}>My Requests</Text>
        {loading ? <ActivityIndicator color={theme.colors.brand} style={{ marginVertical: 20 }} /> :
          tasks.length === 0 ? (
            <Text style={styles.empty}>No requests yet. Ask Sunshine to arrange something from the Health screen.</Text>
          ) : (
            <View style={{ gap: 12, paddingHorizontal: 20 }}>
              {tasks.map((t) => {
                const m = STATUS_META[t.status] || STATUS_META.requested;
                return (
                  <View key={t.id} style={styles.taskCard} testID={`task-${t.id}`}>
                    <View style={styles.taskTop}>
                      <Text style={styles.taskTitle}>{t.title}</Text>
                      <View style={[styles.statusPill, { backgroundColor: m.color + "22" }]}>
                        <Ionicons name={m.icon} size={14} color={m.color} />
                        <Text style={[styles.statusText, { color: m.color }]}>{m.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.taskDetail}>{t.detail}</Text>
                  </View>
                );
              })}
            </View>
          )}

        {/* Accessibility */}
        <Text style={styles.section}>Accessibility</Text>
        <View style={styles.toggleCard}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleIcon}><Ionicons name="text" size={22} color={theme.colors.brand} /></View>
            <Text style={styles.toggleLabel}>Larger text</Text>
            <Switch value={largeText} onValueChange={setLargeText} trackColor={{ true: theme.colors.brand, false: theme.colors.borderStrong }} thumbColor="#fff" testID="toggle-large-text" />
          </View>
        </View>

        <Pressable style={styles.logout} onPress={signOut} testID="logout-btn">
          <Ionicons name="log-out-outline" size={24} color={theme.colors.error} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function CallBtn({ name, icon, onPress }: any) {
  return (
    <Pressable style={styles.callBtn} onPress={onPress} testID={`call-${name}`}>
      <View style={styles.callIcon}><Ionicons name={icon} size={30} color={theme.colors.brand} /></View>
      <Text style={styles.callName}>{name}</Text>
      <View style={styles.callGo}><Ionicons name="call" size={16} color="#fff" /></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: { alignItems: "center", paddingTop: 16 },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 4, borderColor: theme.colors.brandLight },
  name: { fontSize: 26, fontWeight: "800", color: theme.colors.onSurface, marginTop: 12 },
  sub: { fontSize: 16, color: theme.colors.muted },
  codeCard: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 20, marginTop: 20, backgroundColor: theme.colors.brandLight, borderRadius: 24, padding: 20 },
  codeLabel: { fontSize: 15, color: theme.colors.brand, fontWeight: "700" },
  codeValue: { fontSize: 34, fontWeight: "800", color: theme.colors.onSurface, letterSpacing: 4, marginVertical: 2 },
  codeHint: { fontSize: 14, color: theme.colors.onSurfaceSecondary, lineHeight: 19 },
  okay: { flexDirection: "row", alignItems: "center", gap: 14, marginHorizontal: 20, marginTop: 16, backgroundColor: theme.colors.marigold, borderRadius: 24, padding: 20 },
  okayIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: "rgba(0,0,0,0.15)", alignItems: "center", justifyContent: "center" },
  okayTitle: { fontSize: 22, fontWeight: "800", color: theme.colors.onMarigold },
  okaySub: { fontSize: 15, color: "#4A3D00", marginTop: 2 },
  section: { fontSize: 22, fontWeight: "800", color: theme.colors.onSurface, paddingHorizontal: 20, marginTop: 28, marginBottom: 12 },
  callRow: { flexDirection: "row", gap: 12, paddingHorizontal: 20 },
  callBtn: { flex: 1, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 20, padding: 16, alignItems: "center", gap: 8, borderWidth: 1, borderColor: theme.colors.border },
  callIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.brandLight, alignItems: "center", justifyContent: "center" },
  callName: { fontSize: 16, fontWeight: "700", color: theme.colors.onSurface },
  callGo: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.success, alignItems: "center", justifyContent: "center" },
  empty: { fontSize: 16, color: theme.colors.muted, paddingHorizontal: 20, lineHeight: 22 },
  taskCard: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: theme.colors.border, gap: 8 },
  taskTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  taskTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.onSurface, flex: 1 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusText: { fontSize: 13, fontWeight: "800" },
  taskDetail: { fontSize: 15, color: theme.colors.onSurfaceSecondary, lineHeight: 21 },
  toggleCard: { marginHorizontal: 20, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 20, paddingHorizontal: 16, borderWidth: 1, borderColor: theme.colors.border },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16 },
  toggleIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.brandLight, alignItems: "center", justifyContent: "center" },
  toggleLabel: { flex: 1, fontSize: 18, fontWeight: "700", color: theme.colors.onSurface },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginHorizontal: 20, marginTop: 28, paddingVertical: 18, borderRadius: 999, borderWidth: 2, borderColor: theme.colors.error },
  logoutText: { fontSize: 18, fontWeight: "800", color: theme.colors.error },
});
