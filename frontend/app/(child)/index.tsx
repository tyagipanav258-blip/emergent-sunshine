import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { AppText } from "@/src/components/AppText";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetch } from "@/src/api";
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
        apiFetch<{ token: string }>("/prescriptions/image-token").catch(() => ({ token: "" })),
      ]);
      setData(a); setPrescriptions(pres); setTkn(t.token);
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
            <AppText style={styles.hi}>Hi {user?.name?.split(" ")[0]},</AppText>
            <AppText style={styles.headerTitle}>How is {data?.elder_name?.split(" ")[0]}?</AppText>
          </View>
          <View style={styles.avatar} accessible accessibilityLabel={`${data?.elder_name || "Your parent"}'s profile`}>
            <Ionicons name="person" size={26} color={theme.colors.brand} />
          </View>
        </View>

        {/* Status banner */}
        <View style={styles.banner} testID="last-active">
          <View style={styles.pulse}><Ionicons name="pulse" size={26} color={theme.colors.success} /></View>
          <View style={{ flex: 1 }}>
            <AppText style={styles.bannerTitle}>Last active {timeAgo(data?.last_active || null)}</AppText>
            <AppText style={styles.bannerSub}><Ionicons name="location" size={14} color={theme.colors.muted} /> {data?.location}</AppText>
          </View>
        </View>

        {/* Alerts — SOS first, then missed doses */}
        {data?.alerts && data.alerts.length > 0 && (
          <View style={styles.alertsBox} testID="missed-alerts" accessibilityLiveRegion="polite">
            <View style={styles.alertsHead}>
              <Ionicons name="notifications" size={20} color={theme.colors.error} />
              <AppText style={styles.alertsTitle}>
                {data.alerts.some((a) => a.kind === "sos") ? "Needs your attention" : "Missed-dose alerts"}
              </AppText>
            </View>
            {data.alerts.slice(0, 4).map((a, i) => (
              <View key={i} style={styles.alertRow}>
                <View style={[styles.alertDot, a.kind === "sos" && styles.alertDotUrgent]} />
                <AppText style={[styles.alertText, a.kind === "sos" && styles.alertTextUrgent]}>{a.message}</AppText>
              </View>
            ))}
          </View>
        )}

        {/* Stat grid */}
        <View style={styles.grid}>
          <Stat icon="flame" label="Most used" value={data?.most_used_feature || "No activity yet"} color={theme.colors.marigoldDark} />
          <Stat icon="medkit" label="Low stock" value={`${data?.low_stock_count || 0} med`} color={data?.low_stock_count ? theme.colors.error : theme.colors.success} />
          <Stat icon="calendar" label="Appointments" value={`${data?.appointments.length || 0} upcoming`} color={theme.colors.brand} />
          <Pressable
            style={styles.statCard}
            onPress={() => router.push("/(child)/tasks")}
            testID="pending-tasks-card"
            accessibilityRole="button"
            accessibilityLabel={`${data?.pending_tasks || 0} requests to review`}
          >
            <View style={[styles.statIcon, { backgroundColor: theme.colors.marigoldLight }]}><Ionicons name="hourglass" size={24} color={theme.colors.marigoldDark} /></View>
            <AppText style={styles.statValue}>{data?.pending_tasks || 0} pending</AppText>
            <AppText style={styles.statLabel}>Requests to review</AppText>
          </Pressable>
        </View>

        {/* Medicine stock */}
        <AppText style={styles.section}>Medicine Stock</AppText>
        <View style={{ gap: 12, paddingHorizontal: 20 }}>
          {data?.medicines.map((m) => (
            <View key={m.id} style={styles.medRow} testID={`stock-${m.id}`}>
              <Image source={{ uri: m.image }} style={styles.medImg} />
              <View style={{ flex: 1 }}>
                <AppText style={styles.medName}>{m.name}</AppText>
                <AppText style={styles.medMeta}>{m.dose} • {m.time}</AppText>
              </View>
              <View style={[styles.stockBadge, { backgroundColor: (m.low ? theme.colors.error : theme.colors.success) + "22" }]}>
                <AppText style={[styles.stockBadgeText, { color: m.low ? theme.colors.error : theme.colors.success }]}>
                  {m.low ? `Low: ${m.days_left}d` : `${m.stock} left`}
                </AppText>
              </View>
            </View>
          ))}
        </View>

        {/* Appointments */}
        <AppText style={styles.section}>Appointments</AppText>
        <View style={{ gap: 12, paddingHorizontal: 20 }}>
          {data?.appointments.map((a) => (
            <View key={a.id} style={styles.apptRow}>
              <View style={styles.apptIcon}><Ionicons name="calendar" size={22} color={theme.colors.brand} /></View>
              <View style={{ flex: 1 }}>
                <AppText style={styles.medName}>{a.doctor} — {a.specialty}</AppText>
                <AppText style={styles.medMeta}>{a.date} • {a.time} • {a.place}</AppText>
              </View>
              <View style={styles.confirmedPill}><AppText style={styles.confirmedText}>Confirmed</AppText></View>
            </View>
          ))}
        </View>

        {/* Prescriptions */}
        {prescriptions.length > 0 && (
          <>
            <AppText style={styles.section}>Prescriptions</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
              {prescriptions.map((p) => {
                const url = `${API}/prescriptions/${p.id}/image?token=${token}`;
                return (
                  <Pressable key={p.id} style={styles.presCard} onPress={() => setViewer(url)} testID={`prescription-${p.id}`}>
                    <Image source={{ uri: url }} style={styles.presImg} contentFit="cover" />
                    <View style={styles.presMeta}>
                      <Ionicons name="document-text" size={14} color={theme.colors.brand} />
                      <AppText style={styles.presMetaText}>{p.medicines?.length || 0} med(s)</AppText>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}

        <Pressable
          style={styles.callParent}
          onPress={() => router.push({ pathname: "/call", params: { name: data?.elder_name || "Parent", who: "parent" } })}
          testID="call-parent"
          accessibilityRole="button"
          accessibilityLabel={`Video call ${data?.elder_name || "your parent"}`}
        >
          <Ionicons name="videocam" size={22} color="#fff" />
          <AppText style={styles.callParentText}>Video call {data?.elder_name?.split(" ")[0]}</AppText>
        </Pressable>
      </ScrollView>

      {viewer && (
        <View style={styles.viewer} testID="prescription-viewer">
          <Image source={{ uri: viewer }} style={styles.viewerImg} contentFit="contain" />
          <Pressable
            style={[styles.viewerClose, { top: insets.top + 12 }]}
            onPress={() => setViewer(null)}
            testID="viewer-close"
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close prescription photo"
          >
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
      <AppText style={styles.statValue}>{value}</AppText>
      <AppText style={styles.statLabel}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  center: { alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 },
  hi: { fontSize: 16, color: theme.colors.muted, fontWeight: "600" },
  headerTitle: { fontSize: 26, fontWeight: "800", color: theme.colors.onSurface },
  avatar: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: theme.colors.brandLight,
    backgroundColor: theme.colors.surfaceTertiary, alignItems: "center", justifyContent: "center",
  },
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
  alertDotUrgent: { width: 9, height: 9, borderRadius: 5 },
  alertTextUrgent: { fontWeight: "800", color: theme.colors.error },
  presCard: { width: 120, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: theme.colors.border },
  presImg: { width: 120, height: 130, backgroundColor: theme.colors.surfaceTertiary },
  presMeta: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10 },
  presMetaText: { fontSize: 13, fontWeight: "700", color: theme.colors.onSurface },
  viewer: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.94)", alignItems: "center", justifyContent: "center" },
  viewerImg: { width: "92%", height: "80%" },
  viewerClose: { position: "absolute", right: 16, width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
});
