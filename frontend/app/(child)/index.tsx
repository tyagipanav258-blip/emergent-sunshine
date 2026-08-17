import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { AppText } from "@/src/components/AppText";
import { GradientFill } from "@/src/components/GradientFill";
import { GradientButton } from "@/src/components/GradientButton";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAudioPlayer } from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { apiFetch, getToken } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useNotifications } from "@/src/hooks/use-notifications";
import { theme, API } from "@/src/theme";

type VoiceNote = { id: string; from_name: string; created_at: string; played_at: string | null; mine?: boolean };

type Invoice = { id: string; title: string; total: number; status: string; vendor: string; items: { label: string; qty: number; amount: number }[] };

type WeeklySummary = {
  headline: string;
  body: string;
  suggestion: string | null;
  generated: boolean;
  facts: { steps_this_week: number; days_they_walked: number; doses_confirmed_this_week: number };
};

type StepWeek = { today: number; goal: number; total: number; average: number; days_active: number; goal_days: number };

type Analytics = {
  elder_name: string; elder_photo?: string | null; location: string; last_active: string | null;
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
  const { unread } = useNotifications();
  const [data, setData] = useState<Analytics | null>(null);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paying, setPaying] = useState<string | null>(null);
  const [stepWeek, setStepWeek] = useState<StepWeek | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const notePlayer = useAudioPlayer();
  const [token, setTkn] = useState("");
  const [viewer, setViewer] = useState<string | null>(null);
  const [sendingPhoto, setSendingPhoto] = useState(false);
  const [concierge, setConcierge] = useState<{ open: boolean; busy?: boolean; taskId?: string; title?: string; done?: string }>({ open: false });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, pres, t, vn] = await Promise.all([
        apiFetch<Analytics>("/child/analytics"),
        apiFetch<any[]>("/prescriptions").catch(() => []),
        apiFetch<{ token: string }>("/media-token", { method: "POST" }).catch(() => ({ token: "" })),
        apiFetch<VoiceNote[]>("/family/voice-notes").catch(() => []),
      ]);
      setData(a); setPrescriptions(pres); setTkn(t.token); setNotes(vn);
      // Secondary panels shouldn't hold up the dashboard.
      apiFetch<StepWeek>("/health/steps?days=7").then(setStepWeek).catch(() => {});
      apiFetch<WeeklySummary>("/child/weekly-summary").then(setSummary).catch(() => {});
      apiFetch<Invoice[]>("/concierge/invoices").then(setInvoices).catch(() => {});
    } catch {}
    setLoading(false); setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const playNote = useCallback((id: string) => {
    const base = API.replace(/\/api$/, "");
    notePlayer.replace({ uri: `${base}/api/family/voice-notes/${id}/audio?token=${encodeURIComponent(token)}` });
    notePlayer.play();
    setPlayingId(id);
    // Reflect "heard" straight away; the server marks it on first fetch.
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, played_at: new Date().toISOString() } : n)));
  }, [notePlayer, token]);

  if (loading) return <View style={[styles.root, styles.center, { paddingTop: insets.top }]}><ActivityIndicator size="large" color={theme.colors.brand} /></View>;

  const parentName = (data?.elder_name || "your parent").split(" ")[0];

  const openParent = () =>
    router.push({ pathname: "/family/[id]", params: { id: user?.elder_id || "", name: data?.elder_name || "" } });

  /** The action that was hardest to find: pick a photo and send it, from here. */
  const sendPhotoToParent = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    setSendingPhoto(true);
    try {
      const t = await getToken();
      const form = new FormData();
      const uri = res.assets[0].uri;
      form.append("file", { uri, name: uri.split("/").pop() || "photo.jpg", type: "image/jpeg" } as any);
      await fetch(`${API}/family/photos`, { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: form });
      await load();
    } catch {
      // Nothing is lost — the photo simply is not shared.
    }
    setSendingPhoto(false);
  };

  /** Raise a request on the parent's behalf, then choose who sees it through. */
  const askConcierge = async (request: string) => {
    setConcierge((c) => ({ ...c, busy: true }));
    try {
      const t = await apiFetch<any>("/concierge/request", { method: "POST", body: { request } });
      setConcierge({ open: true, taskId: t.id, title: t.title });
    } catch {
      setConcierge({ open: true, done: "Could not raise that just now. Please try again." });
    }
  };

  const assignConcierge = async (assignee: "family" | "concierge") => {
    if (!concierge.taskId) return;
    setConcierge((c) => ({ ...c, busy: true }));
    try {
      const r = await apiFetch<any>(`/concierge/tasks/${concierge.taskId}/assign`, {
        method: "POST", body: { assignee },
      });
      setConcierge({ open: true, done: r.message });
    } catch {
      setConcierge({ open: true, done: "Could not send that just now." });
    }
    load();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="child-dashboard">
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.brand} />}>
        <View style={styles.header}>
          <View>
            <AppText style={styles.hi}>Hi {user?.name?.split(" ")[0]},</AppText>
            <AppText style={styles.headerTitle}>How is {data?.elder_name?.split(" ")[0]}?</AppText>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Pressable
              onPress={() => router.push("/notifications")}
              hitSlop={10}
              style={styles.bell}
              testID="child-notifications"
              accessibilityRole="button"
              accessibilityLabel={unread > 0 ? `Updates, ${unread} new` : "Updates"}
            >
              <Ionicons name="notifications-outline" size={26} color={theme.colors.onSurface} />
              {unread > 0 && (
                <View style={styles.badge}>
                  <AppText style={styles.badgeText}>{unread > 9 ? "9+" : unread}</AppText>
                </View>
              )}
            </Pressable>
            <Pressable
              style={styles.avatar}
              onPress={() => router.push({ pathname: "/family/[id]", params: { id: user?.elder_id || "", name: data?.elder_name || "" } })}
              testID="open-parent-gallery"
              accessibilityRole="button"
              accessibilityLabel={`Photos from ${data?.elder_name || "your parent"}`}
            >
              <Ionicons name="person" size={26} color={theme.colors.brand} />
            </Pressable>
          </View>
        </View>

        {/* Reaching her comes first. These used to be buried behind the small
            avatar in the header, which nobody found. */}
        <View style={styles.connectCard} testID="connect-parent">
          <Pressable
            style={styles.connectTop}
            onPress={openParent}
            testID="connect-open"
            accessibilityRole="button"
            accessibilityLabel={`Open ${parentName}: send a message, a voice note or a photo, and see her photos`}
          >
            <View style={styles.connectFace}>
              {data?.elder_photo
                ? <Image source={{ uri: data.elder_photo }} style={styles.connectImg} contentFit="cover" />
                : <Ionicons name="person" size={38} color={theme.colors.brand} />}
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={styles.connectName}>{data?.elder_name || "Your parent"}</AppText>
              <AppText style={styles.connectSub}>Send her something, or look through her photos</AppText>
            </View>
            <Ionicons name="chevron-forward" size={24} color={theme.colors.brand} />
          </Pressable>

          <View style={styles.connectActions}>
            <ConnectAction icon="camera" label="Send a photo" busy={sendingPhoto}
              onPress={sendPhotoToParent} testID="send-parent-photo"
              hint={`Choose a photo from this phone and share it with ${parentName}`} />
            <ConnectAction icon="mic" label="Voice note"
              onPress={openParent} testID="send-parent-note"
              hint={`Record a voice note for ${parentName}`} />
            <ConnectAction icon="chatbubble-ellipses" label="Message"
              onPress={openParent} testID="send-parent-message"
              hint={`Send ${parentName} a quick message`} />
          </View>
        </View>

        {/* Arranging something is not only the parent's to start. */}
        <Pressable
          style={styles.conciergeCard}
          onPress={() => setConcierge({ open: true })}
          testID="child-concierge"
          accessibilityRole="button"
          accessibilityLabel={`Ask Sunshine to arrange something for ${parentName}`}
          accessibilityHint="Book a doctor, reorder medicine or arrange transport"
        >
          <View style={styles.conciergeIcon}><Ionicons name="sparkles" size={24} color={theme.colors.marigoldDark} /></View>
          <View style={{ flex: 1 }}>
            <AppText style={styles.conciergeTitle}>Arrange something for {parentName}</AppText>
            <AppText style={styles.conciergeSub}>A doctor, a refill or a taxi — do it yourself or let Sunshine.</AppText>
          </View>
          <Ionicons name="chevron-forward" size={22} color={theme.colors.marigoldDark} />
        </Pressable>

        {/* Status banner */}
        <View style={styles.banner} testID="last-active">
          <View style={styles.pulse}><Ionicons name="pulse" size={26} color={theme.colors.success} /></View>
          <View style={{ flex: 1 }}>
            <AppText style={styles.bannerTitle}>Last active {timeAgo(data?.last_active || null)}</AppText>
            <AppText style={styles.bannerSub}><Ionicons name="location" size={14} color={theme.colors.muted} /> {data?.location}</AppText>
          </View>
        </View>

        {/* Voice notes from the parent */}
        {notes.length > 0 && (
          <>
            <AppText style={styles.section}>Voice notes</AppText>
            <View style={{ gap: 12, paddingHorizontal: 20 }}>
              {notes.slice(0, 5).map((n) => {
                const unheard = !n.played_at;
                return (
                  <Pressable
                    key={n.id}
                    style={[styles.noteRow, unheard && styles.noteRowNew]}
                    onPress={() => playNote(n.id)}
                    testID={`voice-note-${n.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Play voice note from ${n.from_name}, ${timeAgo(n.created_at)}${unheard ? ", not heard yet" : ""}`}
                  >
                    <View style={[styles.notePlay, playingId === n.id && { backgroundColor: theme.colors.success }]}><GradientFill tone={playingId === n.id ? "success" : "brand"} radius={23} />
                      <Ionicons name={playingId === n.id ? "volume-high" : "play"} size={22} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText style={styles.medName}>{n.from_name}</AppText>
                      <AppText style={styles.medMeta}>{timeAgo(n.created_at)}</AppText>
                    </View>
                    {unheard && <View style={styles.newPill}><AppText style={styles.newPillText}>New</AppText></View>}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

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

        {/* Payments the family needs to approve */}
        {invoices.filter((i) => i.status === "unpaid").length > 0 && (
          <View style={styles.invoiceBox} testID="invoices">
            <View style={styles.alertsHead}>
              <Ionicons name="card" size={20} color={theme.colors.marigoldDark} />
              <AppText style={styles.invoiceTitle}>Waiting for payment</AppText>
            </View>
            {invoices.filter((i) => i.status === "unpaid").map((inv) => (
              <View key={inv.id} style={styles.invoiceRow} testID={`invoice-${inv.id}`}>
                <View style={{ flex: 1 }}>
                  <AppText style={styles.medName}>{inv.title}</AppText>
                  <AppText style={styles.medMeta}>
                    {inv.vendor} • {inv.items.map((it) => it.label).join(", ")}
                  </AppText>
                </View>
                <GradientButton tone="brand"
                  style={[styles.payBtn, paying === inv.id && { opacity: 0.6 }]}
                  disabled={paying === inv.id}
                  onPress={async () => {
                    setPaying(inv.id);
                    try {
                      await apiFetch(`/concierge/invoices/${inv.id}/pay`, { method: "POST" });
                      await load();
                    } catch {}
                    setPaying(null);
                  }}
                  testID={`pay-${inv.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Pay ${inv.total} rupees for ${inv.title}`}
                >
                  <AppText style={styles.payBtnText}>{paying === inv.id ? "..." : `Pay ₹${inv.total.toFixed(0)}`}</AppText>
                </GradientButton>
              </View>
            ))}
          </View>
        )}

        {/* Plain-language read on the week */}
        {summary && (
          <View style={styles.summaryCard} testID="weekly-summary">
            <View style={styles.summaryHead}>
              <Ionicons name="sparkles" size={20} color={theme.colors.marigoldDark} />
              <AppText style={styles.summaryHeadline}>{summary.headline}</AppText>
            </View>
            <AppText style={styles.summaryBody}>{summary.body}</AppText>
            {summary.suggestion ? (
              <View style={styles.summarySuggestion}>
                <Ionicons name="bulb-outline" size={18} color={theme.colors.brand} />
                <AppText style={styles.summarySuggestionText}>{summary.suggestion}</AppText>
              </View>
            ) : null}
          </View>
        )}

        {/* Stat grid */}
        <View style={styles.grid}>
          <Stat icon="flame" label="Most used" value={data?.most_used_feature || "No activity yet"} color={theme.colors.marigoldDark} />
          <Stat icon="medkit" label="Low stock" value={`${data?.low_stock_count || 0} med`} color={data?.low_stock_count ? theme.colors.error : theme.colors.success} />
          <Stat icon="calendar" label="Appointments" value={`${data?.appointments.length || 0} upcoming`} color={theme.colors.brand} />
          <Stat icon="walk" label={stepWeek ? `Walked ${stepWeek.days_active} of 7 days` : "Walking"} value={stepWeek ? `${stepWeek.total.toLocaleString()} steps` : "No data yet"} color={theme.colors.success} />
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

        <GradientButton tone="brand"
          style={styles.callParent}
          onPress={() => router.push({ pathname: "/call", params: { name: data?.elder_name || "Parent", who: "parent" } })}
          testID="call-parent"
          accessibilityRole="button"
          accessibilityLabel={`Video call ${data?.elder_name || "your parent"}`}
        >
          <Ionicons name="videocam" size={22} color="#fff" />
          <AppText style={styles.callParentText}>Video call {data?.elder_name?.split(" ")[0]}</AppText>
        </GradientButton>
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

      {concierge.open && (
        <View style={styles.backdrop} testID="child-concierge-sheet">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConcierge({ open: false })}
            accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />

            {concierge.done ? (
              <>
                <View style={styles.sheetIcon}><GradientFill tone="success" radius={34} />
                  <Ionicons name="checkmark-circle" size={32} color="#fff" /></View>
                <AppText style={styles.sheetTitle}>Done</AppText>
                <AppText style={styles.sheetSub}>{concierge.done}</AppText>
                <Pressable style={styles.sheetCancel} onPress={() => setConcierge({ open: false })}
                  testID="child-concierge-close" accessibilityRole="button" accessibilityLabel="Close">
                  <AppText style={styles.sheetCancelText}>Close</AppText>
                </Pressable>
              </>
            ) : concierge.taskId ? (
              <>
                <AppText style={styles.sheetTitle}>{concierge.title}</AppText>
                <AppText style={styles.sheetSub}>Who should take care of this?</AppText>
                <Pressable style={styles.choice} onPress={() => assignConcierge("family")}
                  disabled={concierge.busy} testID="child-assign-family"
                  accessibilityRole="button" accessibilityLabel="I will arrange it myself">
                  <View style={styles.choiceIcon}><Ionicons name="people" size={24} color={theme.colors.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <AppText style={styles.choiceTitle}>I will do it</AppText>
                    <AppText style={styles.choiceSub}>It stays on your Tasks list until you mark it done.</AppText>
                  </View>
                </Pressable>
                <Pressable style={styles.choice} onPress={() => assignConcierge("concierge")}
                  disabled={concierge.busy} testID="child-assign-concierge"
                  accessibilityRole="button" accessibilityLabel="Let Sunshine arrange it">
                  <View style={[styles.choiceIcon, { backgroundColor: theme.colors.marigoldLight }]}>
                    <Ionicons name="sparkles" size={24} color={theme.colors.marigoldDark} /></View>
                  <View style={{ flex: 1 }}>
                    <AppText style={styles.choiceTitle}>Let Sunshine do it</AppText>
                    <AppText style={styles.choiceSub}>We arrange it and show you the cost before anything is paid.</AppText>
                  </View>
                </Pressable>
                <Pressable style={styles.sheetCancel} onPress={() => setConcierge({ open: false })}
                  testID="child-assign-cancel" accessibilityRole="button" accessibilityLabel="Not now">
                  <AppText style={styles.sheetCancelText}>Not now</AppText>
                </Pressable>
              </>
            ) : (
              <>
                <AppText style={styles.sheetTitle}>What shall we arrange?</AppText>
                <AppText style={styles.sheetSub}>For {parentName}.</AppText>
                {[
                  { icon: "medkit", label: "Book a doctor", req: "Please book a doctor appointment" },
                  { icon: "repeat", label: "Reorder medicine", req: "Please reorder the low medicines" },
                  { icon: "car", label: "Arrange transport", req: "Please arrange transport for the appointment" },
                ].map((o) => (
                  <Pressable key={o.label} style={styles.choice} onPress={() => askConcierge(o.req)}
                    disabled={concierge.busy} testID={`child-ask-${o.label}`}
                    accessibilityRole="button" accessibilityLabel={o.label}>
                    <View style={styles.choiceIcon}><Ionicons name={o.icon as any} size={24} color={theme.colors.brand} /></View>
                    <AppText style={[styles.choiceTitle, { flex: 1 }]}>{o.label}</AppText>
                    {concierge.busy ? <ActivityIndicator color={theme.colors.brand} /> : null}
                  </Pressable>
                ))}
                <Pressable style={styles.sheetCancel} onPress={() => setConcierge({ open: false })}
                  testID="child-concierge-cancel" accessibilityRole="button" accessibilityLabel="Not now">
                  <AppText style={styles.sheetCancelText}>Not now</AppText>
                </Pressable>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function ConnectAction({ icon, label, onPress, testID, hint, busy }: any) {
  return (
    <Pressable style={styles.connectAction} onPress={onPress} disabled={busy}
      testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint}>
      <View style={styles.connectActionIcon}>
        {busy ? <ActivityIndicator color={theme.colors.brand} /> : <Ionicons name={icon} size={24} color={theme.colors.brand} />}
      </View>
      <AppText style={styles.connectActionLabel}>{label}</AppText>
    </Pressable>
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

  // Reaching the parent: the first block on the screen, not a small avatar.
  connectCard: {
    marginHorizontal: 20, marginTop: 4, marginBottom: 14, padding: 16, gap: 14,
    backgroundColor: theme.colors.surfaceSecondary, borderRadius: 24,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  connectTop: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 72 },
  connectFace: {
    width: 68, height: 68, borderRadius: 34, overflow: "hidden",
    backgroundColor: theme.colors.brandLight, alignItems: "center", justifyContent: "center",
  },
  connectImg: { width: "100%", height: "100%" },
  connectName: { fontSize: 21, fontWeight: "800", color: theme.colors.onSurface },
  connectSub: { fontSize: 14, color: theme.colors.muted, marginTop: 2, lineHeight: 19 },
  connectActions: { flexDirection: "row", gap: 10 },
  connectAction: {
    flex: 1, alignItems: "center", gap: 8, paddingVertical: 12, borderRadius: 18, minHeight: 88,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
  },
  connectActionIcon: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.brandLight,
    alignItems: "center", justifyContent: "center",
  },
  connectActionLabel: { fontSize: 13, fontWeight: "700", color: theme.colors.onSurface, textAlign: "center" },

  conciergeCard: {
    flexDirection: "row", alignItems: "center", gap: 14, marginHorizontal: 20, marginBottom: 16,
    padding: 16, borderRadius: 20, backgroundColor: theme.colors.marigoldLight,
  },
  conciergeIcon: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  conciergeTitle: { fontSize: 17, fontWeight: "800", color: theme.colors.onSurface },
  conciergeSub: { fontSize: 13.5, color: theme.colors.onSurfaceSecondary, marginTop: 2, lineHeight: 18 },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 20, gap: 12, alignItems: "center",
  },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: theme.colors.borderStrong },
  sheetIcon: {
    width: 68, height: 68, borderRadius: 34, overflow: "hidden",
    alignItems: "center", justifyContent: "center", marginTop: 4,
  },
  sheetTitle: { fontSize: 22, fontWeight: "800", color: theme.colors.onSurface, textAlign: "center" },
  sheetSub: { fontSize: 15, color: theme.colors.muted, textAlign: "center", lineHeight: 21 },
  choice: {
    flexDirection: "row", alignItems: "center", gap: 14, alignSelf: "stretch",
    padding: 16, borderRadius: 20, backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1, borderColor: theme.colors.border, minHeight: 72,
  },
  choiceIcon: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: theme.colors.brandLight,
    alignItems: "center", justifyContent: "center",
  },
  choiceTitle: { fontSize: 17, fontWeight: "800", color: theme.colors.onSurface },
  choiceSub: { fontSize: 13.5, color: theme.colors.onSurfaceSecondary, marginTop: 2, lineHeight: 18 },
  sheetCancel: { alignSelf: "stretch", alignItems: "center", paddingVertical: 16, minHeight: 52, justifyContent: "center" },
  sheetCancelText: { fontSize: 17, fontWeight: "700", color: theme.colors.onSurfaceSecondary },
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
  bell: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute", top: 4, right: 2, minWidth: 20, height: 20, borderRadius: 10,
    paddingHorizontal: 5, backgroundColor: theme.colors.error,
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.colors.surface,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  invoiceBox: {
    marginHorizontal: 20, marginTop: 16, backgroundColor: theme.colors.marigoldLight,
    borderRadius: theme.radius.lg, padding: 16, gap: 10,
  },
  invoiceTitle: { fontSize: theme.font.base, fontWeight: "800", color: theme.colors.onSurface },
  invoiceRow: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md, padding: 12, minHeight: 68,
  },
  payBtn: {
    backgroundColor: theme.colors.brand, borderRadius: theme.radius.pill,
    paddingHorizontal: 18, paddingVertical: 12, minHeight: 48, justifyContent: "center",
  },
  payBtnText: { color: "#fff", fontSize: theme.font.sm, fontWeight: "800" },
  summaryCard: {
    marginHorizontal: 20, marginTop: 16, backgroundColor: theme.colors.marigoldLight,
    borderRadius: theme.radius.lg, padding: 18, gap: 10,
  },
  summaryHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  summaryHeadline: { flex: 1, fontSize: theme.font.md, fontWeight: "800", color: theme.colors.onSurface },
  summaryBody: { fontSize: theme.font.base, color: theme.colors.onSurfaceSecondary, lineHeight: 24 },
  summarySuggestion: {
    flexDirection: "row", gap: 8, alignItems: "flex-start",
    backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, padding: 12,
  },
  summarySuggestionText: { flex: 1, fontSize: theme.font.sm, color: theme.colors.onSurface, lineHeight: 21 },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.colors.border, minHeight: 72 },
  noteRowNew: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brandLight },
  notePlay: { width: 46, height: 46, borderRadius: 23, backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center" },
  newPill: { backgroundColor: theme.colors.marigold, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  newPillText: { fontSize: 13, fontWeight: "800", color: theme.colors.onMarigold },
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
