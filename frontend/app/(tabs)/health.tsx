import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { theme, API } from "@/src/theme";

type Med = { id: string; name: string; dose: string; time: string; taken: boolean };
type Appt = { id: string; doctor: string; specialty: string; date: string; time: string; place: string };
type Overview = {
  greeting: string;
  name: string;
  message: string;
  medicines: Med[];
  appointments: Appt[];
  medicines_due: number;
};

export default function HealthScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Overview | null>(null);
  const [sos, setSos] = useState<{ open: boolean; result?: any }>({ open: false });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/health/overview`);
      setData(await res.json());
    } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggleMed = async (id: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setData((d) => d ? { ...d, medicines: d.medicines.map((m) => m.id === id ? { ...m, taken: !m.taken } : m) } : d);
    try { await fetch(`${API}/health/medicines/${id}/taken`, { method: "POST" }); } catch {}
  };

  const triggerSOS = async () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setSos({ open: true });
    try {
      const res = await fetch(`${API}/sos`, { method: "POST" });
      const j = await res.json();
      setSos({ open: true, result: j });
    } catch {
      setSos({ open: true, result: { message: "Could not reach network. Please try again." } });
    }
  };

  if (!data) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center", paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={theme.colors.brand} />
      </View>
    );
  }

  const nextAppt = data.appointments[0];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="health-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{data.greeting}, {data.name}</Text>
            <Text style={styles.subGreeting}>{data.message}</Text>
          </View>
          <Image
            source={{ uri: "https://images.unsplash.com/photo-1590905707155-17c680dd7867?w=200&q=80" }}
            style={styles.avatar}
          />
        </View>

        {/* SOS */}
        <Pressable style={styles.sosBtn} onPress={triggerSOS} testID="sos-btn">
          <View style={styles.sosIconWrap}>
            <Ionicons name="warning" size={32} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sosTitle}>SOS — Emergency</Text>
            <Text style={styles.sosSub}>Tap to alert your family & doctor</Text>
          </View>
          <Ionicons name="chevron-forward" size={26} color="#fff" />
        </Pressable>

        {/* Medicines */}
        <Text style={styles.sectionTitle}>Today&apos;s Medicines</Text>
        <View style={styles.medList}>
          {data.medicines.map((m) => (
            <Pressable
              key={m.id}
              style={[styles.medCard, m.taken && styles.medCardTaken]}
              onPress={() => toggleMed(m.id)}
              testID={`med-${m.id}`}
            >
              <View style={[styles.medCheck, m.taken && styles.medCheckOn]}>
                {m.taken && <Ionicons name="checkmark" size={22} color="#fff" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.medName, m.taken && { textDecorationLine: "line-through", color: theme.colors.muted }]}>{m.name}</Text>
                <Text style={styles.medMeta}>{m.dose} • {m.time}</Text>
              </View>
              <Text style={styles.medAction}>{m.taken ? "Taken" : "Mark taken"}</Text>
            </Pressable>
          ))}
        </View>

        {/* Appointments */}
        <Text style={styles.sectionTitle}>Upcoming</Text>
        {nextAppt && (
          <View style={styles.apptCard} testID="appointment-card">
            <View style={styles.apptIconWrap}>
              <Ionicons name="calendar" size={28} color={theme.colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.apptDoctor}>{nextAppt.doctor}</Text>
              <Text style={styles.apptSpec}>{nextAppt.specialty}</Text>
              <Text style={styles.apptTime}>{nextAppt.date} • {nextAppt.time}</Text>
              <Text style={styles.apptPlace}>{nextAppt.place}</Text>
            </View>
          </View>
        )}

        {/* Big action grid */}
        <View style={styles.grid}>
          <ActionCard icon="medkit" title="Medicines" sub={`${data.medicines_due} due today`} testID="card-medicines" />
          <ActionCard icon="calendar-outline" title="Appointments" sub={`${data.appointments.length} upcoming`} testID="card-appointments" />
          <ActionCard icon="videocam" title="Doctor" sub="Book or join call" testID="card-doctor" />
          <ActionCard icon="heart-circle" title="My Care" sub="Reminders & tips" testID="card-mycare" />
        </View>
      </ScrollView>

      {sos.open && (
        <View style={styles.sheetBackdrop} testID="sos-sheet">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSos({ open: false })} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sosBigIcon}>
              <Ionicons name={sos.result ? "shield-checkmark" : "alert-circle"} size={44} color="#fff" />
            </View>
            <Text style={styles.sheetTitle}>
              {sos.result ? "Help is on the way" : "Alerting your family..."}
            </Text>
            <Text style={styles.sheetSub}>
              {sos.result?.message || "Please stay calm. We're contacting your family and doctor."}
            </Text>
            {sos.result?.contacts_notified && (
              <View style={styles.contactsBox}>
                {sos.result.contacts_notified.map((c: string) => (
                  <View key={c} style={styles.contactRow}>
                    <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
                    <Text style={styles.contactText}>{c} notified</Text>
                  </View>
                ))}
              </View>
            )}
            <Pressable
              style={[styles.sheetBtn, !sos.result && { opacity: 0.6 }]}
              onPress={() => setSos({ open: false })}
              disabled={!sos.result}
              testID="sos-close"
            >
              <Text style={styles.sheetBtnText}>{sos.result ? "OK, thank you" : "Please wait..."}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function ActionCard({ icon, title, sub, testID }: any) {
  return (
    <Pressable style={styles.actionCard} testID={testID}>
      <View style={styles.actionIconWrap}>
        <Ionicons name={icon} size={30} color={theme.colors.brand} />
      </View>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionSub}>{sub}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  greetingRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 12 },
  greeting: { fontSize: 26, fontWeight: "800", color: theme.colors.onSurface },
  subGreeting: { fontSize: 17, color: theme.colors.muted, marginTop: 4 },
  avatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: theme.colors.brandLight },

  sosBtn: {
    marginHorizontal: 20,
    backgroundColor: theme.colors.error,
    borderRadius: 24,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: theme.colors.error,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  sosIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  sosTitle: { color: "#fff", fontSize: 22, fontWeight: "800" },
  sosSub: { color: "rgba(255,255,255,0.9)", fontSize: 15, marginTop: 2 },

  sectionTitle: { fontSize: 22, fontWeight: "800", color: theme.colors.onSurface, paddingHorizontal: 20, marginTop: 28, marginBottom: 12 },
  medList: { paddingHorizontal: 20, gap: 12 },
  medCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 20,
    padding: 16,
    gap: 14,
  },
  medCardTaken: { backgroundColor: theme.colors.surfaceTertiary },
  medCheck: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 2, borderColor: theme.colors.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  medCheckOn: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
  medName: { fontSize: 19, fontWeight: "700", color: theme.colors.onSurface },
  medMeta: { fontSize: 15, color: theme.colors.muted, marginTop: 2 },
  medAction: { fontSize: 14, fontWeight: "700", color: theme.colors.brand },

  apptCard: {
    marginHorizontal: 20,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 24,
    padding: 18,
    flexDirection: "row",
    gap: 14,
  },
  apptIconWrap: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: theme.colors.brandLight,
    alignItems: "center", justifyContent: "center",
  },
  apptDoctor: { fontSize: 20, fontWeight: "800", color: theme.colors.onSurface },
  apptSpec: { fontSize: 15, color: theme.colors.muted, marginTop: 2 },
  apptTime: { fontSize: 17, fontWeight: "700", color: theme.colors.brand, marginTop: 6 },
  apptPlace: { fontSize: 15, color: theme.colors.onSurfaceSecondary, marginTop: 2 },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 12,
    marginTop: 24,
  },
  actionCard: {
    width: "48%",
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 24,
    padding: 20,
    gap: 8,
    minHeight: 140,
  },
  actionIconWrap: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: theme.colors.brandLight,
    alignItems: "center", justifyContent: "center",
    marginBottom: 6,
  },
  actionTitle: { fontSize: 19, fontWeight: "800", color: theme.colors.onSurface },
  actionSub: { fontSize: 14, color: theme.colors.muted },

  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingBottom: 40,
    alignItems: "center",
    gap: 12,
  },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: theme.colors.borderStrong },
  sosBigIcon: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: theme.colors.error,
    alignItems: "center", justifyContent: "center",
    marginTop: 12,
  },
  sheetTitle: { fontSize: 24, fontWeight: "800", color: theme.colors.onSurface, textAlign: "center", marginTop: 4 },
  sheetSub: { fontSize: 17, color: theme.colors.onSurfaceSecondary, textAlign: "center", lineHeight: 24, paddingHorizontal: 12 },
  contactsBox: { alignSelf: "stretch", backgroundColor: theme.colors.surfaceSecondary, borderRadius: 20, padding: 16, gap: 10, marginTop: 8 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  contactText: { fontSize: 17, fontWeight: "600", color: theme.colors.onSurface },
  sheetBtn: {
    alignSelf: "stretch",
    backgroundColor: theme.colors.brand,
    borderRadius: 999,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: 12,
  },
  sheetBtnText: { color: "#fff", fontSize: 18, fontWeight: "800" },
});
