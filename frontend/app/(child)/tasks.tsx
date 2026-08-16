import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { apiFetch } from "@/src/api";
import { theme } from "@/src/theme";

type Task = { id: string; kind: string; title: string; detail: string; status: string; auto: boolean; timeline: any[] };

const KIND_ICON: Record<string, any> = { reorder: "repeat", doctor: "medkit", transport: "car", other: "sparkles" };
const STATUS_ORDER = ["requested", "approved", "in_progress", "done"];
const STATUS_META: Record<string, { label: string; color: string }> = {
  requested: { label: "Requested", color: theme.colors.marigoldDark },
  approved: { label: "Approved", color: theme.colors.info },
  in_progress: { label: "In progress", color: theme.colors.brand },
  done: { label: "Done", color: theme.colors.success },
  declined: { label: "Declined", color: theme.colors.error },
};

export default function ChildTasks() {
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setTasks(await apiFetch<Task[]>("/concierge/tasks")); } catch {}
    setLoading(false); setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setStatus = async (id: string, status: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusyId(id);
    try {
      const t = await apiFetch<Task>(`/concierge/tasks/${id}/status`, { method: "POST", body: { status } });
      setTasks((prev) => prev.map((x) => x.id === id ? t : x));
    } catch {}
    setBusyId(null);
  };

  const pending = tasks.filter((t) => ["requested", "approved", "in_progress"].includes(t.status));
  const doneTasks = tasks.filter((t) => ["done", "declined"].includes(t.status));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="child-tasks">
      <Text style={styles.title}>Concierge Tasks</Text>
      <Text style={styles.subtitle}>Requests from your parent to review and arrange.</Text>
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 120, paddingTop: 8 }} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.brand} />}>
          {tasks.length === 0 && <Text style={styles.empty}>No requests yet. When your parent asks Sunshine to arrange something, it will appear here.</Text>}

          {pending.map((t) => {
            const m = STATUS_META[t.status];
            const stepIndex = STATUS_ORDER.indexOf(t.status);
            return (
              <View key={t.id} style={styles.card} testID={`ctask-${t.id}`}>
                <View style={styles.cardTop}>
                  <View style={styles.kindIcon}><Ionicons name={KIND_ICON[t.kind] || "sparkles"} size={22} color={theme.colors.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{t.title}</Text>
                    {t.auto && <Text style={styles.autoTag}>Auto-detected from low medicine</Text>}
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: m.color + "22" }]}><Text style={[styles.statusText, { color: m.color }]}>{m.label}</Text></View>
                </View>
                <Text style={styles.cardDetail}>{t.detail}</Text>

                {/* progress */}
                <View style={styles.steps}>
                  {STATUS_ORDER.map((s, i) => (
                    <View key={s} style={styles.step}>
                      <View style={[styles.dot, i <= stepIndex && { backgroundColor: theme.colors.brand }]} />
                      {i < STATUS_ORDER.length - 1 && <View style={[styles.line, i < stepIndex && { backgroundColor: theme.colors.brand }]} />}
                    </View>
                  ))}
                </View>

                <View style={styles.actions}>
                  {t.status === "requested" && (
                    <>
                      <Pressable style={[styles.actionBtn, styles.approve]} disabled={busyId === t.id} onPress={() => setStatus(t.id, "approved")} testID={`approve-${t.id}`}>
                        <Text style={styles.approveText}>{busyId === t.id ? "..." : "Approve & arrange"}</Text>
                      </Pressable>
                      <Pressable style={[styles.actionBtn, styles.decline]} disabled={busyId === t.id} onPress={() => setStatus(t.id, "declined")} testID={`decline-${t.id}`}>
                        <Text style={styles.declineText}>Decline</Text>
                      </Pressable>
                    </>
                  )}
                  {t.status === "approved" && (
                    <Pressable style={[styles.actionBtn, styles.approve, { flex: 1 }]} disabled={busyId === t.id} onPress={() => setStatus(t.id, "in_progress")} testID={`progress-${t.id}`}>
                      <Text style={styles.approveText}>Mark in progress</Text>
                    </Pressable>
                  )}
                  {t.status === "in_progress" && (
                    <Pressable style={[styles.actionBtn, styles.done, { flex: 1 }]} disabled={busyId === t.id} onPress={() => setStatus(t.id, "done")} testID={`done-${t.id}`}>
                      <Text style={styles.approveText}>Mark as done</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}

          {doneTasks.length > 0 && <Text style={styles.section}>Completed</Text>}
          {doneTasks.map((t) => {
            const m = STATUS_META[t.status];
            return (
              <View key={t.id} style={[styles.card, { opacity: 0.7 }]}>
                <View style={styles.cardTop}>
                  <View style={styles.kindIcon}><Ionicons name={KIND_ICON[t.kind] || "sparkles"} size={22} color={theme.colors.muted} /></View>
                  <Text style={[styles.cardTitle, { flex: 1 }]}>{t.title}</Text>
                  <View style={[styles.statusPill, { backgroundColor: m.color + "22" }]}><Text style={[styles.statusText, { color: m.color }]}>{m.label}</Text></View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface, paddingHorizontal: 20 },
  title: { fontSize: 26, fontWeight: "800", color: theme.colors.onSurface, marginTop: 8 },
  subtitle: { fontSize: 16, color: theme.colors.muted, marginTop: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { fontSize: 16, color: theme.colors.muted, lineHeight: 22, marginTop: 40, textAlign: "center" },
  card: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: 20, padding: 16, gap: 10, marginBottom: 14, borderWidth: 1, borderColor: theme.colors.border },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  kindIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.colors.brandLight, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.onSurface },
  autoTag: { fontSize: 13, color: theme.colors.marigoldDark, fontWeight: "700", marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusText: { fontSize: 13, fontWeight: "800" },
  cardDetail: { fontSize: 15, color: theme.colors.onSurfaceSecondary, lineHeight: 21 },
  steps: { flexDirection: "row", alignItems: "center", marginVertical: 4 },
  step: { flexDirection: "row", alignItems: "center", flex: 1 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: theme.colors.borderStrong },
  line: { flex: 1, height: 3, backgroundColor: theme.colors.borderStrong, marginHorizontal: 2 },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  actionBtn: { flex: 1, borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  approve: { backgroundColor: theme.colors.brand },
  approveText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  decline: { backgroundColor: theme.colors.surfaceTertiary },
  declineText: { color: theme.colors.onSurface, fontSize: 16, fontWeight: "700" },
  done: { backgroundColor: theme.colors.success },
  section: { fontSize: 20, fontWeight: "800", color: theme.colors.onSurface, marginTop: 12, marginBottom: 12 },
});
