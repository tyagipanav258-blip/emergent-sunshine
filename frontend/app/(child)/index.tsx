import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetch, getToken } from "@/src/api";
import { useAuth } from "@/src/auth";
import { theme, API } from "@/src/theme";

type Analytics = {
  elder_name: string; location: string; last_active: string | null;
  most_used_feature: string; medicines: any[]; low_stock_count: number;
  appointments: any[]; pending_tasks: number; missed_doses: any[]; alerts: any[];
};

function timeAgo(iso: string | null): string {
  if (!iso) return "No activity yet";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} day(s) ago`;
}

export default function ChildDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<Analytics | null>(null);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [token, setTkn] = useState("");
  const [viewer, setViewer] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, pres, t] = await Promise.all([
        apiFetch<Analytics>("/child/analytics"),
        apiFetch<any[]>("/prescriptions").catch(() => []),
        getToken(),
      ]);
      setData(a); setPrescriptions(pres); setTkn(t);
    } catch {}
    setLoading(false); setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={[styles.root, styles.center, { paddingTop: insets.top }]}><ActivityIndicator size="large" color={theme.colors.brand} /></View>;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="child-dashboard">
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.brand} />}>
        <View style={styles.header}>
          <View>
            <Text style={styles.hi}>Hi {user?.name?.split(" ")[0]},</Text>
            <Text style={styles.headerTitle}>How is {data?.elder_name?.split(" ")[0]}?</Text>
          </View>
          <Image source={{ uri: "https://images.unsplash.com/photo-1590905707155-17c680dd7867?w=200&q=80" }} style={styles.avatar} />
        </View>

        {/* Status banner */}
        <View style={styles.banner} testID="last-active">
          <View style={styles.pulse}><Ionicons name="pulse" size={26} color={theme.colors.success} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Last active {timeAgo(data?.last_active || null)}</Text>
            <Text style={styles.bannerSub}><Ionicons name="location" size={14} color={theme.colors.muted} /> {data?.location}</Text>
          </View>
        </View>

        {/* Missed-dose alerts */}
        {data?.alerts && data.alerts.length > 0 && (
          <View style={styles.alertsBox} testID="missed-alerts">
            <View style={styles.alertsHead}>
              <Ionicons name="notifications" size={20} color={theme.colors.error} />
              <Text style={styles.alertsTitle}>Missed-dose alerts</Text>
            </View>
            {data.alerts.slice(0, 4).map((a, i) => (
              <View key={i} style={styles.alertRow}>
                <View style={styles.alertDot} />
                <Text style={styles.alertText}>{a.message}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Stat grid */}
        <View style={styles.grid}>
          <Stat icon="flame" label="Most used" value={data?.most_used_feature || "—"} color={theme.colors.marigoldDark} />
          <Stat icon="medkit" label="Low stock" value={`${data?.low_stock_count || 0} med`} color={data?.low_stock_count ? theme.colors.error : theme.colors.success} />
          <Stat icon="calendar" label="Appointments" value={`${data?.appointments.length || 0} upcoming`} color={theme.colors.brand} />
          <Pressable style={styles.statCard} onPress={() => router.push("/(child)/tasks")} testID="pending-tasks-card">
            <View style={[styles.statIcon, { backgroundColor: theme.colors.marigoldLight }]}><Ionicons name="hourglass" size={24} color={theme.colors.marigoldDark} /></View>
            <Text style={styles.statValue}>{data?.pending_tasks || 0} pending</Text>
            <Text style={styles.statLabel}>Requests to review</Text>
          </Pressable>
        </View>

        {/* Medicine stock */}
        <Text style={styles.section}>Medicine Stock</Text>
        <View style={{ gap: 12, paddingHorizontal: 20 }}>
          {data?.medicines.map((m) => (
            <View key={m.id} style={styles.medRow} testID={`stock-${m.id}`}>
              <Image source={{ uri: m.image }} style={styles.medImg} />
              <View style={{ flex: 1 }}>
                <Text style={styles.medName}>{m.name}</Text>
                <Text style={styles.medMeta}>{m.dose} • {m.time}</Text>
              </View>
              <View style={[styles.stockBadge, { backgroundColor: (m.low ? theme.colors.error : theme.colors.success) + "22" }]}>
                <Text style={[styles.stockBadgeText, { color: m.low ? theme.colors.error : theme.colors.success }]}>
                  {m.low ? `Low: ${m.days_left}d` : `${m.stock} left`}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Appointments */}
        <Text style={styles.section}>Appointments</Text>
        <View style={{ gap: 12, paddingHorizontal: 20 }}>
          {data?.appointments.map((a) => (
            <View key={a.id} style={styles.apptRow}>
              <View style={styles.apptIcon}><Ionicons name="calendar" size={22} color={theme.colors.brand} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.medName}>{a.doctor} — {a.specialty}</Text>
                <Text style={styles.medMeta}>{a.date} • {a.time} • {a.place}</Text>
              </View>
              <View style={styles.confirmedPill}><Text style={styles.confirmedText}>Confirmed</Text></View>
            </View>
          ))}
        </View>

        {/* Prescriptions */}
        {prescriptions.length > 0 && (
          <>
            <Text style={styles.section}>Prescriptions</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
              {prescriptions.map((p) => {
                const url = `${API}/prescriptions/${p.id}/image?token=${token}`;
                return (
                  <Pressable key={p.id} style={styles.presCard} onPress={() => setViewer(url)} testID={`prescription-${p.id}`}>
                    <Image source={{ uri: url }} style={styles.presImg} contentFit="cover" />
                    <View style={styles.presMeta}>
                      <Ionicons name="document-text" size={14} color={theme.colors.brand} />
                      <Text style={styles.presMetaText}>{p.medicines?.length || 0} med(s)</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}

        <Pressable style={styles.callParent} onPress={() => router.push({ pathname: "/call", params: { name: data?.elder_name || "Parent", who: "daughter" } })} testID="call-parent">
          <Ionicons name="videocam" size={22} color="#fff" />
          <Text style={styles.callParentText}>Video call {data?.elder_name?.split(" ")[0]}</Text>
        </Pressable>
      </ScrollView>

      {viewer && (
        <View style={styles.viewer} testID="prescription-viewer">
          <Image source={{ uri: viewer }} style={styles.viewerImg} contentFit="contain" />
          <Pressable style={[styles.viewerClose, { top: insets.top + 12 }]} onPress={() => setViewer(null)} testID="viewer-close" hitSlop={12}>
            <Ionicons name="close" size={32} color="#fff" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function Stat({ icon, label, value, color }: any) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: color + "22" }]}><Ionicons name={icon} size={24} color={color} /></View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  center: { alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 },
  hi: { fontSize: 16, color: theme.colors.muted, fontWeight: "600" },
  headerTitle: { fontSize: 26, fontWeight: "800", color: theme.colors.onSurface },
  avatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: theme.colors.brandLight },
  banner: { flexDirection: "row", alignItems: "center", gap: 14, marginHorizontal: 20, backgroundColor: theme.colors.brandLight, borderRadius: 20, padding: 18 },
  pulse: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  bannerTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.onSurface },
  bannerSub: { fontSize: 15, color: theme.colors.muted, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 20, marginTop: 16 },
  statCard: { width: "47%", backgroundColor: theme.colors.surfaceSecondary, borderRadius: 20, padding: 16, gap: 6, borderWidth: 1, borderColor: theme.colors.border },
  statIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: "800", color: theme.colors.onSurface },
  statLabel: { fontSize: 14, color: theme.colors.muted },
  section: { fontSize: 22, fontWeight: "800", color: theme.colors.onSurface, paddingHorizontal: 20, marginTop: 28, marginBottom: 12 },
  medRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: theme.colors.border },
  medImg: { width: 44, height: 44, borderRadius: 12 },
  medName: { fontSize: 17, fontWeight: "700", color: theme.colors.onSurface },
  medMeta: { fontSize: 14, color: theme.colors.muted, marginTop: 2 },
  stockBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  stockBadgeText: { fontSize: 14, fontWeight: "800" },
  apptRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: theme.colors.border },
  apptIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.brandLight, alignItems: "center", justifyContent: "center" },
  confirmedPill: { backgroundColor: theme.colors.success + "22", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  confirmedText: { color: theme.colors.success, fontSize: 13, fontWeight: "800" },
  callParent: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginHorizontal: 20, marginTop: 24, backgroundColor: theme.colors.brand, borderRadius: 999, paddingVertical: 18 },
  callParentText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  alertsBox: { marginHorizontal: 20, marginTop: 16, backgroundColor: theme.colors.error + "12", borderRadius: 20, padding: 16, borderWidth: 1.5, borderColor: theme.colors.error + "44", gap: 8 },
  alertsHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  alertsTitle: { fontSize: 17, fontWeight: "800", color: theme.colors.error },
  alertRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  alertDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.error },
  alertText: { fontSize: 15, color: theme.colors.onSurface, flex: 1, fontWeight: "500" },
  presCard: { width: 120, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: theme.colors.border },
  presImg: { width: 120, height: 130, backgroundColor: theme.colors.surfaceTertiary },
  presMeta: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10 },
  presMetaText: { fontSize: 13, fontWeight: "700", color: theme.colors.onSurface },
  viewer: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.94)", alignItems: "center", justifyContent: "center" },
  viewerImg: { width: "92%", height: "80%" },
  viewerClose: { position: "absolute", right: 16, width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
});
