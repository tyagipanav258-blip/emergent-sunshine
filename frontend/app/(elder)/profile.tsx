import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Platform, ActivityIndicator, Share } from "react-native";
import { AppText } from "@/src/components/AppText";
import { Image } from "expo-image";
import { AlertSettings } from "@/src/components/AlertSettings";
import { GradientButton } from "@/src/components/GradientButton";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { apiFetch } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useTextScale } from "@/src/text-scale";
import { useScrollChrome } from "@/src/scroll-context";
import { theme, TEXT_SCALES, TextScaleKey } from "@/src/theme";

type FamilyMember = { id: string; name: string; relation: string; photo_url?: string | null };

const TEXT_SIZE_OPTIONS: { key: TextScaleKey; label: string }[] = [
  { key: "normal", label: "Normal" },
  { key: "large", label: "Large" },
  { key: "larger", label: "Largest" },
];

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
  const { onScroll } = useScrollChrome();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { key: textScaleKey, setScale } = useTextScale();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [okay, setOkay] = useState<{ state: "idle" | "sent"; message?: string }>({ state: "idle" });
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, f] = await Promise.all([
        apiFetch<Task[]>("/concierge/tasks"),
        apiFetch<{ members: FamilyMember[] }>("/family").catch(() => ({ members: [] })),
      ]);
      setTasks(t);
      setFamily(f.members || []);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sendOkay = async () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const r = await apiFetch<{ message: string }>("/im-okay", { method: "POST" });
      setOkay({ state: "sent", message: r.message });
    } catch {
      setOkay({ state: "sent", message: "We couldn't reach the network. Please try again." });
    }
    setTimeout(() => setOkay({ state: "idle" }), 4000);
  };

  const inviteText = user?.family_code
    ? `Join me on Sunshine so you can help look after me. Open this link: sunshine://join?code=${user.family_code} — or enter code ${user.family_code} when you sign up.`
    : "";

  const shareCode = async () => {
    if (!user?.family_code) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    try {
      await Share.share({ message: inviteText });
    } catch {
      // Sharing unavailable (or dismissed) — fall back to the copy button below.
    }
  };

  const copyCode = async () => {
    if (!user?.family_code) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    await Clipboard.setStringAsync(user.family_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="elder-profile">
      <ScrollView contentContainerStyle={{ paddingBottom: theme.fabClearance }}
          onScroll={onScroll}
          scrollEventThrottle={32} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.avatar} accessible accessibilityLabel={`Profile picture for ${user?.name || "you"}`}>
            {user?.photo_url ? (
              <Image source={{ uri: user.photo_url }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <Ionicons name="person" size={48} color={theme.colors.brand} />
            )}
          </View>
          <AppText style={styles.name}>{user?.name}</AppText>
          {user?.location ? <AppText style={styles.sub}>{user.location}</AppText> : null}
        </View>

        {/* I'm Okay */}
        <GradientButton
          tone={okay.state === "sent" ? "success" : "sunrise"}
          style={styles.okay}
          onPress={sendOkay}
          testID="im-okay-btn"
          accessibilityRole="button"
          accessibilityLabel="I'm okay"
          accessibilityHint="Lets your connected family know you are doing well"
        >
          <View style={styles.okayIcon}>
            <Ionicons name={okay.state === "sent" ? "checkmark-circle" : "sunny"} size={30} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <AppText style={[styles.okayTitle, okay.state === "sent" && styles.okayTitleSent]}>
              {okay.state === "sent" ? "Sent" : "I'm Okay"}
            </AppText>
            <AppText style={[styles.okaySub, okay.state === "sent" && styles.okaySubSent]}>
              {okay.state === "sent" ? okay.message : "One tap to reassure your family"}
            </AppText>
          </View>
        </GradientButton>

        {/* Real family only */}
        <AppText style={styles.section}>Stay Connected</AppText>
        {family.length === 0 ? (
          <View style={styles.emptyCard} testID="family-empty">
            <Ionicons name="people-outline" size={34} color={theme.colors.muted} />
            <AppText style={styles.emptyTitle}>No family connected yet</AppText>
            <AppText style={styles.empty}>
              When someone joins with your family code they will appear here, and you can call them with one tap.
            </AppText>
          </View>
        ) : (
          <View style={styles.callRow}>
            {family.map((f) => (
              <CallBtn
                key={f.id}
                name={f.name.split(" ")[0]}
                relation={f.relation}
                photo={f.photo_url}
                onPress={() => router.push({ pathname: "/call", params: { name: f.name, who: f.relation } })}
              />
            ))}
          </View>
        )}

        {/* My Requests (concierge) */}
        <AppText style={styles.section}>My Requests</AppText>
        {loading ? <ActivityIndicator color={theme.colors.brand} style={{ marginVertical: 20 }} /> :
          tasks.length === 0 ? (
            <AppText style={styles.empty}>No requests yet. Ask Sunshine to arrange something from the Health screen.</AppText>
          ) : (
            <View style={{ gap: 12, paddingHorizontal: 20 }}>
              {tasks.map((t) => {
                const m = STATUS_META[t.status] || STATUS_META.requested;
                return (
                  <View key={t.id} style={styles.taskCard} testID={`task-${t.id}`}>
                    <View style={styles.taskTop}>
                      <AppText style={styles.taskTitle}>{t.title}</AppText>
                      <View style={[styles.statusPill, { backgroundColor: m.color + "22" }]}>
                        <Ionicons name={m.icon} size={14} color={m.color} />
                        <AppText style={[styles.statusText, { color: m.color }]}>{m.label}</AppText>
                      </View>
                    </View>
                    <AppText style={styles.taskDetail}>{t.detail}</AppText>
                  </View>
                );
              })}
            </View>
          )}

        {/* What's on the app — the same choices first run asked for. */}
        <AppText style={styles.section}>What&apos;s on my app</AppText>
        <Pressable
          style={styles.linkRow}
          onPress={() => {
            if (Platform.OS !== "web") Haptics.selectionAsync();
            router.push("/my-app-settings");
          }}
          testID="open-my-app-settings"
          accessibilityRole="button"
          accessibilityLabel="What's on my app. Choose which parts of Sunshine you want and where it opens."
        >
          <View style={styles.linkIcon}><Ionicons name="options" size={22} color={theme.colors.brand} /></View>
          <View style={{ flex: 1 }}>
            <AppText style={styles.linkLabel}>Choose what you want</AppText>
            <AppText style={styles.linkSub}>Videos, requests, scanning — and where the app opens</AppText>
          </View>
          <Ionicons name="chevron-forward" size={22} color={theme.colors.muted} />
        </Pressable>

        {/* Who comes if she presses the button — reassurance, mainly. */}
        <Pressable
          style={[styles.linkRow, { marginTop: 12 }]}
          onPress={() => {
            if (Platform.OS !== "web") Haptics.selectionAsync();
            router.push("/care-contacts");
          }}
          testID="open-care-contacts"
          accessibilityRole="button"
          accessibilityLabel="Who we can call. See who we ring if you press SOS."
        >
          <View style={styles.linkIcon}><Ionicons name="call" size={22} color={theme.colors.brand} /></View>
          <View style={{ flex: 1 }}>
            <AppText style={styles.linkLabel}>Who we can call</AppText>
            <AppText style={styles.linkSub}>Who we ring if you press SOS, and your doctors</AppText>
          </View>
          <Ionicons name="chevron-forward" size={22} color={theme.colors.muted} />
        </Pressable>

        {/* Alerts */}
        <AppText style={styles.section}>Alerts on this phone</AppText>
        <AlertSettings />

        {/* Accessibility */}
        <AppText style={styles.section}>Text size</AppText>
        <View style={styles.toggleCard}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleIcon}><Ionicons name="text" size={22} color={theme.colors.brand} /></View>
            <AppText style={styles.toggleLabel}>Make text bigger everywhere</AppText>
          </View>
          <View style={styles.sizeRow} accessibilityRole="radiogroup">
            {TEXT_SIZE_OPTIONS.map((o) => {
              const on = o.key === textScaleKey;
              return (
                <Pressable
                  key={o.key}
                  style={[styles.sizeBtn, on && styles.sizeBtnOn]}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.selectionAsync();
                    setScale(o.key);
                  }}
                  testID={`text-size-${o.key}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${o.label} text size`}
                >
                  <AppText style={[styles.sizeBtnSample, { fontSize: Math.round(17 * TEXT_SCALES[o.key]) }, on && styles.sizeBtnTextOn]}>Aa</AppText>
                  <AppText style={[styles.sizeBtnText, on && styles.sizeBtnTextOn]}>{o.label}</AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Family code lives at the foot — it matters once, when inviting. */}
        <View style={styles.codeCard} testID="family-code-card">
          <View style={styles.codeTop}>
            <View style={{ flex: 1 }}>
              <AppText style={styles.codeLabel}>Your family code</AppText>
              <AppText
                style={styles.codeValue}
                accessibilityLabel={`Your family code is ${user?.family_code?.split("").join(" ")}`}
              >
                {user?.family_code}
              </AppText>
            </View>
            <Ionicons name="people-circle" size={44} color={theme.colors.brand} />
          </View>
          <AppText style={styles.codeHint}>
            {family.length > 0
              ? `${family.map((f) => f.name).join(", ")} ${family.length === 1 ? "is" : "are"} connected. Share the code to add someone else.`
              : "Nobody is connected yet. Send this to your son or daughter so they can look after you."}
          </AppText>
          <View style={styles.codeBtns}>
            <GradientButton tone="brand"
              style={styles.shareBtn}
              onPress={shareCode}
              testID="share-family-code"
              accessibilityRole="button"
              accessibilityLabel="Share your family code"
              accessibilityHint="Opens your phone's share options so you can send an invite"
            >
              <Ionicons name="share-social" size={22} color="#fff" />
              <AppText style={styles.shareBtnText}>Invite family</AppText>
            </GradientButton>
            <Pressable
              style={styles.copyBtn}
              onPress={copyCode}
              testID="copy-family-code"
              accessibilityRole="button"
              accessibilityLabel={copied ? "Family code copied" : "Copy your family code"}
            >
              <Ionicons name={copied ? "checkmark" : "copy-outline"} size={20} color={theme.colors.brand} />
              <AppText style={styles.copyBtnText}>{copied ? "Copied" : "Copy"}</AppText>
            </Pressable>
          </View>
        </View>

        <Pressable
          style={styles.logout}
          onPress={signOut}
          testID="logout-btn"
          accessibilityRole="button"
          accessibilityLabel="Log out of Sunshine"
        >
          <Ionicons name="log-out-outline" size={24} color={theme.colors.error} />
          <AppText style={styles.logoutText}>Log out</AppText>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function CallBtn({ name, relation, photo, onPress }:
  { name: string; relation?: string; photo?: string | null; onPress: () => void }) {
  return (
    <Pressable
      style={styles.callBtn}
      onPress={onPress}
      testID={`call-${name}`}
      accessibilityRole="button"
      accessibilityLabel={relation ? `Call ${name}, your ${relation.toLowerCase()}` : `Call ${name}`}
    >
      <View style={styles.callIcon}>
        {photo
          ? <Image source={{ uri: photo }} style={styles.callImg} contentFit="cover" />
          : <Ionicons name="person" size={30} color={theme.colors.brand} />}
      </View>
      <AppText style={styles.callName}>{name}</AppText>
      {relation ? <AppText style={styles.callRelation}>{relation}</AppText> : null}
      <View style={styles.callGo}><Ionicons name="call" size={16} color="#fff" /></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: { alignItems: "center", paddingTop: 16 },
  avatar: {
    width: 100, height: 100, borderRadius: 50, borderWidth: 4, borderColor: theme.colors.brandLight,
    backgroundColor: theme.colors.surfaceTertiary, alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  name: { fontSize: theme.font.xl, fontWeight: "800", color: theme.colors.onSurface, marginTop: 12 },
  sub: { fontSize: theme.font.base, color: theme.colors.muted },
  codeCard: { marginHorizontal: 20, marginTop: 20, backgroundColor: theme.colors.brandLight, borderRadius: 24, padding: 20, gap: 12 },
  codeTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  codeLabel: { fontSize: theme.font.sm, color: theme.colors.brand, fontWeight: "700" },
  codeValue: { fontSize: theme.font.xxl, fontWeight: "800", color: theme.colors.onSurface, letterSpacing: 4, marginVertical: 2 },
  codeHint: { fontSize: theme.font.sm, color: theme.colors.onSurfaceSecondary, lineHeight: 21 },
  codeBtns: { flexDirection: "row", gap: 10 },
  shareBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.colors.brand, borderRadius: theme.radius.pill, paddingVertical: 16, minHeight: 56,
  },
  shareBtnText: { color: "#fff", fontSize: theme.font.base, fontWeight: "800" },
  copyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.pill,
    paddingVertical: 16, paddingHorizontal: 20, minHeight: 56,
  },
  copyBtnText: { color: theme.colors.brand, fontSize: theme.font.base, fontWeight: "800" },
  emptyCard: {
    marginHorizontal: 20, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 20,
    padding: 24, alignItems: "center", gap: 8, borderWidth: 1, borderColor: theme.colors.border,
  },
  emptyTitle: { fontSize: theme.font.md, fontWeight: "800", color: theme.colors.onSurface },
  callRelation: { fontSize: theme.font.xs, color: theme.colors.muted },
  sizeRow: { flexDirection: "row", gap: 10, paddingBottom: 16 },
  sizeBtn: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: 12, minHeight: 72,
    borderRadius: theme.radius.md, borderWidth: 2, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  sizeBtnOn: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brandLight },
  sizeBtnSample: { fontWeight: "800", color: theme.colors.onSurface },
  sizeBtnText: { fontSize: theme.font.xs, fontWeight: "700", color: theme.colors.muted },
  sizeBtnTextOn: { color: theme.colors.brand },
  okay: { flexDirection: "row", alignItems: "center", gap: 14, marginHorizontal: 20, marginTop: 16, borderRadius: 24, padding: 20 },
  okayIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: "rgba(0,0,0,0.15)", alignItems: "center", justifyContent: "center" },
  okayTitle: { fontSize: 22, fontWeight: "800", color: theme.colors.onMarigold },
  okayTitleSent: { color: "#fff" },
  okaySub: { fontSize: 15, color: "#5C3208", marginTop: 2 },
  okaySubSent: { color: "rgba(255,255,255,0.92)" },
  section: { fontSize: 22, fontWeight: "800", color: theme.colors.onSurface, paddingHorizontal: 20, marginTop: 28, marginBottom: 12 },
  callRow: { flexDirection: "row", gap: 12, paddingHorizontal: 20 },
  callBtn: { flex: 1, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 20, padding: 16, alignItems: "center", gap: 8, borderWidth: 1, borderColor: theme.colors.border },
  callIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.brandLight, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  callImg: { width: "100%", height: "100%" },
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
  linkRow: {
    flexDirection: "row", alignItems: "center", gap: 14, marginHorizontal: 20, padding: 16, minHeight: 76,
    backgroundColor: theme.colors.surfaceSecondary, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border,
  },
  linkIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.brandLight, alignItems: "center", justifyContent: "center" },
  linkLabel: { fontSize: 18, fontWeight: "800", color: theme.colors.onSurface },
  linkSub: { fontSize: 15, color: theme.colors.muted, marginTop: 2, lineHeight: 21 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16 },
  toggleIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.brandLight, alignItems: "center", justifyContent: "center" },
  toggleLabel: { flex: 1, fontSize: 18, fontWeight: "700", color: theme.colors.onSurface },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginHorizontal: 20, marginTop: 28, paddingVertical: 18, borderRadius: 999, borderWidth: 2, borderColor: theme.colors.error },
  logoutText: { fontSize: 18, fontWeight: "800", color: theme.colors.error },
});
