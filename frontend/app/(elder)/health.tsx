import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, TextInput, Linking } from "react-native";
import { AppText } from "@/src/components/AppText";
import { GradientFill } from "@/src/components/GradientFill";
import { GradientButton } from "@/src/components/GradientButton";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { apiFetch, logActivity } from "@/src/api";
import { useSteps } from "@/src/hooks/use-steps";
import { useScrollChrome } from "@/src/scroll-context";
import { medArt } from "@/src/constants/med-art";
import { theme } from "@/src/theme";

const ICON_REORDER = require("../../assets/images/health/icon-reorder.png");
const ICON_DOCTOR = require("../../assets/images/health/icon-doctor.png");
const ICON_TRANSPORT = require("../../assets/images/health/icon-transport.png");
const ICON_WALK = require("../../assets/images/health/icon-walk.png");

type Med = { id: string; name: string; dose: string; time: string; type: string; stock: number; per_day: number; taken_today: boolean; image: string; days_left: number; low: boolean };
type Appt = { id: string; doctor: string; specialty: string; date: string; time: string; place: string };

const TYPE_ICON: Record<string, any> = { tablet: "ellipse", capsule: "medical", syrup: "flask", drops: "water" };

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Explainer = {
  name: string;
  what_for: string;
  how_to_take: string;
  watch_for: string;
  unknown: boolean;
  disclaimer: string;
};

export default function ElderHealth() {
  const insets = useSafeAreaInsets();
  const { onScroll, setChromeSuppressed } = useScrollChrome();
  const [meds, setMeds] = useState<Med[]>([]);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [missed, setMissed] = useState<any[]>([]);
  const [greeting, setGreeting] = useState("Hello");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [ocr, setOcr] = useState<{ open: boolean; busy?: boolean; result?: any[]; error?: string }>({ open: false });
  const [concierge, setConcierge] = useState<{ open: boolean; text: string; busy?: boolean; done?: string }>({ open: false, text: "" });
  const [toast, setToast] = useState("");
  const [undo, setUndo] = useState<Med | null>(null);
  const [remove, setRemove] = useState<Med | null>(null);
  const [removing, setRemoving] = useState(false);
  const [explain, setExplain] = useState<{ med: Med; busy: boolean; data?: Explainer; error?: string } | null>(null);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [assign, setAssign] = useState<{ taskId: string; title: string; busy?: boolean; done?: string } | null>(null);
  const [family, setFamily] = useState<{ id: string; name: string }[]>([]);
  const steps = useSteps();

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<any>("/health/overview");
      setMeds(d.medicines); setAppts(d.appointments); setGreeting(d.greeting); setName(d.name); setMissed(d.missed || []);
      apiFetch<{ members: { id: string; name: string }[] }>("/family")
        .then((f) => setFamily(f.members || [])).catch(() => {});
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { logActivity("Health"); load(); }, [load]);

  // Hide the floating buttons whenever a sheet is open, so they never sit on
  // top of its controls.
  const anySheetOpen = Boolean(ocr.open || concierge.open || undo || remove || explain || stepsOpen || assign);
  // Tabs stay mounted when you switch away, so suppression has to follow focus
  // as well as the sheet. Without this, opening a sheet here and tapping another
  // tab leaves the floating buttons invisible and dead on every other screen.
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  useEffect(() => {
    setChromeSuppressed(focused && anySheetOpen);
  }, [focused, anySheetOpen, setChromeSuppressed]);
  useEffect(() => () => setChromeSuppressed(false), [setChromeSuppressed]);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2500); };

  /**
   * Confirming a dose is explicit, never a toggle: tapping an already-confirmed
   * medicine asks first, so a mis-tap can't silently erase an adherence record.
   */
  const setMedTaken = async (id: string, taken: boolean) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMeds((prev) => prev.map((m) => (m.id === id ? { ...m, taken_today: taken } : m)));
    try {
      const r = await apiFetch<any>(`/health/medicines/${id}/take`, { method: "POST", body: { taken } });
      setMeds((prev) => prev.map((m) => (m.id === id ? r.medicine : m)));
      if (r.reorder_task) showToast(`${r.medicine.name} is low — reorder sent to family`);
    } catch {
      load();
    }
  };

  const onMedPress = (m: Med) => {
    if (m.taken_today) setUndo(m);
    else setMedTaken(m.id, true);
  };

  const deleteMed = async () => {
    if (!remove) return;
    setRemoving(true);
    try {
      const r = await apiFetch<any>(`/health/medicines/${remove.id}`, { method: "DELETE" });
      setMeds((prev) => prev.filter((m) => m.id !== remove.id));
      showToast(r.message || `${remove.name} removed`);
    } catch {
      showToast("Could not remove it. Please try again.");
    }
    setRemoving(false);
    setRemove(null);
    load();
  };

  const explainMed = async (m: Med) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setExplain({ med: m, busy: true });
    try {
      const d = await apiFetch<Explainer>(`/health/medicines/${m.id}/explain`, { method: "POST" });
      setExplain({ med: m, busy: false, data: d });
    } catch {
      setExplain({ med: m, busy: false, error: "We could not look that up just now. Please try again." });
    }
  };

  const nextDue = meds.find((m) => !m.taken_today);

  const capturePrescription = async (fromCamera: boolean) => {
    setOcr({ open: true, busy: false });
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setOcr({ open: true, error: "Please allow photo access to scan a prescription." });
        return;
      }
      const res = fromCamera
        ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6, allowsEditing: true });
      if (res.canceled || !res.assets?.[0]?.base64) { setOcr({ open: false }); return; }
      setOcr({ open: true, busy: true });
      const out = await apiFetch<any>("/health/prescriptions", { method: "POST", body: { image_base64: res.assets[0].base64 } });
      setOcr({ open: true, result: out.medicines });
    } catch (e: any) {
      setOcr({ open: true, error: e.message || "Could not read the prescription." });
    }
  };

  const addOcrMeds = async () => {
    if (!ocr.result?.length) { setOcr({ open: false }); return; }
    setOcr((o) => ({ ...o, busy: true }));
    try {
      for (const m of ocr.result) {
        await apiFetch("/health/medicines", { method: "POST", body: m });
      }
      showToast(`${ocr.result.length} medicine(s) added`);
    } catch {}
    setOcr({ open: false });
    load();
  };

  /**
   * Creating a request no longer finishes it — the elder still has to say who
   * should do it, so nothing is silently dropped on the family.
   */
  const sendConcierge = async (preset?: string) => {
    const text = preset || concierge.text;
    if (!text.trim()) return;
    setConcierge((c) => ({ ...c, busy: true }));
    try {
      const t = await apiFetch<any>("/concierge/request", { method: "POST", body: { request: text } });
      setConcierge({ open: false, text: "" });
      setAssign({ taskId: t.id, title: t.title });
    } catch {
      setConcierge((c) => ({ ...c, busy: false }));
    }
  };

  const chooseAssignee = async (assignee: "family" | "concierge") => {
    if (!assign) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setAssign({ ...assign, busy: true });
    try {
      const r = await apiFetch<any>(`/concierge/tasks/${assign.taskId}/assign`, {
        method: "POST", body: { assignee },
      });
      setAssign({ ...assign, busy: false, done: r.message });
    } catch {
      setAssign({ ...assign, busy: false, done: "We couldn't send that. Please try again." });
    }
  };

  if (loading) return <View style={[styles.root, styles.center, { paddingTop: insets.top }]}><ActivityIndicator size="large" color={theme.colors.brand} /></View>;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="elder-health">
      <ScrollView contentContainerStyle={{ paddingBottom: theme.fabClearance }}
          onScroll={onScroll}
          scrollEventThrottle={32} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <AppText style={styles.greeting}>{greeting}, {name}</AppText>
          <AppText style={styles.sub}>Here&apos;s what you need today.</AppText>
        </View>

        {/* Today's walking */}
        <Pressable
          style={styles.stepsCard}
          onPress={() => { if (Platform.OS !== "web") Haptics.selectionAsync(); steps.refresh(); setStepsOpen(true); }}
          testID="steps-card"
          accessibilityRole="button"
          accessibilityLabel={
            steps.available === false
              ? "Step counting is not available on this device"
              : `${steps.today} steps today. Open your weekly walking summary.`
          }
        >
          <View style={styles.stepsIcon}><GradientFill tone="brandSoft" radius={28} /><Image source={ICON_WALK} style={styles.stepsIconArt} contentFit="contain" /></View>
          <View style={{ flex: 1 }}>
            {/* A count already synced from a phone is worth showing even where
                this device has no sensor of its own. */}
            {(steps.available === false || steps.denied) && steps.today === 0 ? (
              <>
                <AppText style={styles.stepsLabel}>Steps today</AppText>
                <AppText style={styles.stepsUnavailable}>
                  {steps.denied
                    ? "Allow motion access to count your steps."
                    : "This device can't count steps. Your weekly history still shows here."}
                </AppText>
              </>
            ) : (
              <>
                <AppText style={styles.stepsLabel}>Steps today</AppText>
                <AppText style={styles.stepsValue}>{steps.today.toLocaleString()}</AppText>
                <View style={styles.stepsBarTrack}>
                  <View
                    style={[
                      styles.stepsBarFill,
                      { width: `${Math.min(100, Math.round((steps.today / (steps.week?.goal || 3000)) * 100))}%` },
                    ]}
                  />
                </View>
                <AppText style={styles.stepsGoal}>
                  {steps.today >= (steps.week?.goal || 3000)
                    ? "You reached your goal today. Wonderful!"
                    : `${Math.max((steps.week?.goal || 3000) - steps.today, 0).toLocaleString()} more to reach your goal`}
                </AppText>
              </>
            )}
          </View>
          <Ionicons name="chevron-forward" size={24} color={theme.colors.brand} />
        </Pressable>

        {/* Missed dose reminder */}
        {missed.length > 0 && (
          <View style={styles.missedBanner} testID="missed-banner">
            <Ionicons name="alarm" size={24} color={theme.colors.error} />
            <View style={{ flex: 1 }}>
              <AppText style={styles.missedTitle}>{missed.length} medicine{missed.length > 1 ? "s" : ""} not marked taken</AppText>
              <AppText style={styles.missedSub}>Tap the medicine below to confirm you took it.</AppText>
            </View>
          </View>
        )}

        {/* Intake prompt */}
        {nextDue ? (
          <View style={styles.intake} testID="intake-prompt"><GradientFill tone="sunriseSoft" radius={24} />
            {/* Image beside the question rather than stacked above it — the
                stacked version left a band of empty card doing nothing. */}
            <View style={styles.intakeTop}>
              <View style={[styles.intakeImg, { backgroundColor: medArt(nextDue.name, nextDue.type).tint }]}>
                <Image source={medArt(nextDue.name, nextDue.type).image} style={styles.intakeImgArt} contentFit="contain" />
              </View>
              <View style={{ flex: 1 }}>
                <AppText style={styles.intakeQ}>Did you take your {nextDue.name}?</AppText>
                <AppText style={styles.intakeMeta}>{nextDue.dose} • due {nextDue.time}</AppText>
              </View>
            </View>
            <View style={styles.intakeBtns}>
              <Pressable
                style={[styles.intakeBtn, styles.intakeYes]}
                onPress={() => setMedTaken(nextDue.id, true)}
                testID="intake-yes"
                accessibilityRole="button"
                accessibilityLabel={`Yes, I took my ${nextDue.name}`}
              >
                <Ionicons name="checkmark-circle" size={26} color="#fff" />
                <AppText style={styles.intakeYesText}>Yes, taken</AppText>
              </Pressable>
              <Pressable
                style={[styles.intakeBtn, styles.intakeNot]}
                onPress={() => showToast("Okay, we'll remind you soon")}
                testID="intake-not"
                accessibilityRole="button"
                accessibilityLabel="Not yet, remind me later"
              >
                <AppText style={styles.intakeNotText}>Not yet</AppText>
              </Pressable>
            </View>
          </View>
        ) : meds.length === 0 ? (
          <View style={[styles.intake, styles.intakeCentred]} testID="intake-empty"><GradientFill tone="sunriseSoft" radius={24} />
            <Ionicons name="camera" size={40} color={theme.colors.marigoldDark} />
            <AppText style={styles.intakeQ}>Let&apos;s add your medicines</AppText>
            <AppText style={styles.intakeMeta}>
              Take a photo of your prescription and we&apos;ll add them for you.
            </AppText>
            <Pressable
              style={[styles.intakeBtn, styles.intakeYes, { alignSelf: "stretch", marginTop: 14 }]}
              onPress={() => setOcr({ open: true })}
              testID="empty-scan"
              accessibilityRole="button"
              accessibilityLabel="Scan a prescription to add your medicines"
            >
              <Ionicons name="camera" size={26} color="#fff" />
              <AppText style={styles.intakeYesText}>Scan my prescription</AppText>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.intake, styles.intakeCentred]} testID="intake-done"><GradientFill tone="sunriseSoft" radius={24} />
            <Ionicons name="checkmark-done-circle" size={40} color={theme.colors.success} />
            <AppText style={styles.intakeQ}>All medicines taken today</AppText>
            <AppText style={styles.intakeMeta}>Wonderful! Keep it up.</AppText>
          </View>
        )}

        {/* Medicines list */}
        <View style={styles.sectionRow}>
          <AppText style={styles.sectionInRow}>My Medicines</AppText>
          <Pressable
            style={styles.scanBtn}
            onPress={() => setOcr({ open: true })}
            testID="scan-prescription"
            accessibilityRole="button"
            accessibilityLabel="Scan a prescription"
            accessibilityHint="Takes a photo of your prescription and adds the medicines for you"
          >
            <Ionicons name="camera" size={20} color={theme.colors.brand} />
            <AppText style={styles.scanText}>Scan</AppText>
          </Pressable>
        </View>
        <View style={styles.medList}>
          {meds.map((m) => (
            <Pressable
              key={m.id}
              style={styles.medCard}
              onPress={() => onMedPress(m)}
              testID={`med-${m.id}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: m.taken_today }}
              accessibilityLabel={`${m.name}, ${m.dose}, due ${m.time}`}
              accessibilityHint={m.taken_today ? "Already confirmed today. Activate to undo." : "Activate to confirm you took it"}
            >
              <View style={[styles.medImg, { backgroundColor: medArt(m.name, m.type).tint }]}>
                <Image source={medArt(m.name, m.type).image} style={styles.medImgArt} contentFit="contain" />
              </View>
              <View style={{ flex: 1 }}>
                <AppText style={[styles.medName, m.taken_today && styles.struck]}>{m.name}</AppText>
                <AppText style={styles.medMeta}>{m.dose} • {m.time}</AppText>
                <View style={styles.stockRow}>
                  <Ionicons name={TYPE_ICON[m.type] || "ellipse"} size={14} color={m.low ? theme.colors.error : theme.colors.muted} />
                  <AppText style={[styles.stockText, m.low && { color: theme.colors.error, fontWeight: "700" }]}>
                    {m.low ? `Low — ${m.days_left} day${m.days_left === 1 ? "" : "s"} left` : `${m.stock} left`}
                  </AppText>
                </View>
              </View>
              <View style={[styles.check, m.taken_today && styles.checkOn]}>
                {m.taken_today && <Ionicons name="checkmark" size={22} color="#fff" />}
              </View>

              {/* Row actions sit outside the confirm target so neither is a mis-tap for the other. */}
              <View style={styles.medActions}>
                <Pressable
                  style={styles.medAction}
                  onPress={() => explainMed(m)}
                  hitSlop={6}
                  testID={`explain-${m.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`What is ${m.name} for?`}
                >
                  <Ionicons name="help-circle-outline" size={26} color={theme.colors.brand} />
                </Pressable>
                <Pressable
                  style={styles.medAction}
                  onPress={() => { if (Platform.OS !== "web") Haptics.selectionAsync(); setRemove(m); }}
                  hitSlop={6}
                  testID={`remove-${m.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${m.name} from my medicines`}
                >
                  <Ionicons name="trash-outline" size={24} color={theme.colors.error} />
                </Pressable>
              </View>
            </Pressable>
          ))}
        </View>

        {/* Appointments */}
        <AppText style={styles.section}>Appointments</AppText>
        {appts.length === 0 && (
          <AppText style={styles.sectionEmpty} testID="appts-empty">
            No appointments yet. Ask Sunshine below to book a doctor for you.
          </AppText>
        )}
        {appts.map((a) => (
          <View key={a.id} style={styles.apptCard} testID={`appt-${a.id}`}>
            <View style={styles.apptIcon}><Ionicons name="calendar" size={26} color={theme.colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <AppText style={styles.apptDoc}>{a.doctor}</AppText>
              <AppText style={styles.apptSpec}>{a.specialty}</AppText>
              <AppText style={styles.apptTime}>{a.date} • {a.time}</AppText>
            </View>
          </View>
        ))}

        {/* Care actions */}
        <AppText style={styles.section}>Care & Concierge</AppText>
        <View style={styles.grid}>
          <GridBtn image={ICON_REORDER} label="Reorder medicine" onPress={() => sendConcierge("Please reorder my low medicines")} />
          <GridBtn image={ICON_DOCTOR} label="Book a doctor" onPress={() => sendConcierge("Please book a doctor appointment for me")} />
          <GridBtn image={ICON_TRANSPORT} label="Arrange transport" onPress={() => sendConcierge("Please arrange transport for my appointment")} />
        </View>
        <Pressable
          style={styles.askConcierge}
          onPress={() => setConcierge({ open: true, text: "" })}
          testID="open-concierge"
          accessibilityRole="button"
          accessibilityLabel="Ask Sunshine to arrange something"
          accessibilityHint="Sends a request to your family to arrange it for you"
        >
          <Ionicons name="sparkles" size={22} color={theme.colors.marigoldDark} />
          <AppText style={styles.askConciergeText}>Ask Sunshine to arrange something</AppText>
        </Pressable>
      </ScrollView>

      {/* OCR sheet */}
      {ocr.open && (
        <View style={styles.backdrop} testID="ocr-sheet">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !ocr.busy && setOcr({ open: false })} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.handle} />
            <AppText style={styles.sheetTitle}>Scan a prescription</AppText>
            {ocr.busy ? (
              <View style={styles.ocrBusy}><ActivityIndicator size="large" color={theme.colors.brand} /><AppText style={styles.sheetSub}>Reading your prescription...</AppText></View>
            ) : ocr.result ? (
              <View style={{ gap: 12, alignSelf: "stretch" }}>
                <View style={styles.savedRow}>
                  <Ionicons name="lock-closed" size={16} color={theme.colors.success} />
                  <AppText style={styles.savedText}>Photo saved securely — your family can view it</AppText>
                </View>
                {ocr.result.length > 0 ? (
                  <>
                    <AppText style={styles.sheetSub}>We found {ocr.result.length} medicine(s):</AppText>
                    {ocr.result.map((m, i) => (
                      <View key={i} style={styles.ocrItem}>
                        <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
                        <AppText style={styles.ocrItemText}>{m.name} {m.dose ? `• ${m.dose}` : ""} • {m.time}</AppText>
                      </View>
                    ))}
                    <GradientButton tone="brand" style={styles.primaryBtn} onPress={addOcrMeds} testID="ocr-add"><AppText style={styles.primaryBtnText}>Add to my medicines</AppText></GradientButton>
                  </>
                ) : (
                  <>
                    <AppText style={styles.sheetSub}>We couldn&apos;t read any medicines, but the photo is saved for your family to check.</AppText>
                    <GradientButton tone="brand" style={styles.primaryBtn} onPress={() => setOcr({ open: false })}><AppText style={styles.primaryBtnText}>Done</AppText></GradientButton>
                  </>
                )}
              </View>
            ) : ocr.error ? (
              <View style={{ gap: 12, alignItems: "center" }}>
                <AppText style={styles.sheetSub}>{ocr.error}</AppText>
                <Pressable style={styles.secondaryBtn} onPress={() => Linking.openSettings()}><AppText style={styles.secondaryBtnText}>Open Settings</AppText></Pressable>
              </View>
            ) : (
              <View style={{ gap: 12, alignSelf: "stretch" }}>
                <AppText style={styles.sheetSub}>Take a clear photo of your prescription and we&apos;ll add your medicines for you.</AppText>
                <GradientButton tone="brand" style={styles.primaryBtn} onPress={() => capturePrescription(true)} testID="ocr-camera"><Ionicons name="camera" size={22} color="#fff" /><AppText style={styles.primaryBtnText}>  Take a photo</AppText></GradientButton>
                <Pressable style={styles.secondaryBtn} onPress={() => capturePrescription(false)} testID="ocr-gallery"><AppText style={styles.secondaryBtnText}>Choose from gallery</AppText></Pressable>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Concierge sheet */}
      {concierge.open && (
        <View style={styles.backdrop} testID="concierge-sheet">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !concierge.busy && setConcierge({ open: false, text: "" })} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.handle} />
            {concierge.done ? (
              <View style={{ alignItems: "center", gap: 10 }}>
                <View style={styles.sosDone}><GradientFill tone="success" radius={36} /><Ionicons name="checkmark" size={40} color="#fff" /></View>
                <AppText style={styles.sheetTitle}>Request sent!</AppText>
                <AppText style={styles.sheetSub}>&quot;{concierge.done}&quot; was sent to your family. They will arrange it and you can track it in your Profile.</AppText>
                <GradientButton tone="brand" style={styles.primaryBtn} onPress={() => setConcierge({ open: false, text: "" })}><AppText style={styles.primaryBtnText}>OK</AppText></GradientButton>
              </View>
            ) : (
              <View style={{ alignSelf: "stretch", gap: 12 }}>
                <AppText style={styles.sheetTitle}>What can we arrange?</AppText>
                <TextInput style={styles.input} placeholder="e.g. Book a taxi to the clinic tomorrow" placeholderTextColor={theme.colors.muted} value={concierge.text} onChangeText={(t) => setConcierge((c) => ({ ...c, text: t }))} multiline testID="concierge-input" />
                <GradientButton tone="brand" style={[styles.primaryBtn, (!concierge.text.trim() || concierge.busy) && { opacity: 0.5 }]} disabled={!concierge.text.trim() || concierge.busy} onPress={() => sendConcierge()} testID="concierge-send">
                  <AppText style={styles.primaryBtnText}>{concierge.busy ? "Sending..." : "Send to family"}</AppText>
                </GradientButton>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Who should do it: the family, or Sunshine? */}
      {assign && (
        <View style={styles.backdrop} testID="assign-sheet">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !assign.busy && setAssign(null)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.handle} />

            {assign.done ? (
              <>
                <View style={styles.sosDone}><Ionicons name="checkmark" size={40} color="#fff" /></View>
                <AppText style={styles.sheetTitle}>All set</AppText>
                <AppText style={styles.sheetSub}>{assign.done}</AppText>
                <GradientButton tone="brand" style={styles.primaryBtn} onPress={() => setAssign(null)} testID="assign-done"
                  accessibilityRole="button" accessibilityLabel="Close">
                  <AppText style={styles.primaryBtnText}>OK</AppText>
                </GradientButton>
              </>
            ) : assign.busy ? (
              <View style={{ alignItems: "center", gap: 12, paddingVertical: 24 }}>
                <ActivityIndicator size="large" color={theme.colors.brand} />
                <AppText style={styles.sheetSub}>Just a moment...</AppText>
              </View>
            ) : (
              <>
                <AppText style={styles.sheetTitle}>{assign.title}</AppText>
                <AppText style={styles.sheetSub}>Who would you like to take care of this?</AppText>

                <Pressable
                  style={[styles.choiceCard, family.length === 0 && styles.choiceDisabled]}
                  onPress={() => family.length > 0 && chooseAssignee("family")}
                  disabled={family.length === 0}
                  testID="assign-family"
                  accessibilityRole="button"
                  accessibilityLabel={
                    family.length > 0
                      ? `Ask my family. ${family.map((f) => f.name).join(", ")} will be told.`
                      : "Ask my family. Nobody is connected yet."
                  }
                >
                  <View style={styles.choiceIcon}><Ionicons name="people" size={26} color={theme.colors.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <AppText style={styles.choiceTitle}>Ask my family</AppText>
                    <AppText style={styles.choiceSub}>
                      {family.length > 0
                        ? `${family.map((f) => f.name.split(" ")[0]).join(", ")} will arrange it. No cost through Sunshine.`
                        : "Nobody is connected yet. Share your family code first."}
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color={theme.colors.brand} />
                </Pressable>

                <Pressable
                  style={styles.choiceCard}
                  onPress={() => chooseAssignee("concierge")}
                  testID="assign-concierge"
                  accessibilityRole="button"
                  accessibilityLabel="Let Sunshine arrange it. Your family will be asked to approve the cost before anything is paid for."
                >
                  <View style={[styles.choiceIcon, { backgroundColor: theme.colors.marigoldLight }]}>
                    <Ionicons name="sparkles" size={26} color={theme.colors.marigoldDark} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText style={styles.choiceTitle}>Let Sunshine do it</AppText>
                    <AppText style={styles.choiceSub}>
                      We arrange it for you. Your family sees the cost and approves it before anything is paid.
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color={theme.colors.marigoldDark} />
                </Pressable>

                <Pressable style={styles.secondaryBtn} onPress={() => setAssign(null)} testID="assign-cancel"
                  accessibilityRole="button" accessibilityLabel="Not now">
                  <AppText style={styles.secondaryBtnText}>Not now</AppText>
                </Pressable>
              </>
            )}
          </View>
        </View>
      )}

      {/* Removing a medicine asks first and says what else it will withdraw. */}
      {remove && (
        <View style={styles.backdrop} testID="remove-sheet">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !removing && setRemove(null)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.handle} />
            <View style={styles.removeIcon}><GradientFill tone="danger" radius={36} /><Ionicons name="trash" size={36} color="#fff" /></View>
            <AppText style={styles.sheetTitle}>Remove {remove.name}?</AppText>
            <AppText style={styles.sheetSub}>
              It will disappear from your list, along with its reminders and its record of the doses you took.
            </AppText>
            {removing ? (
              <ActivityIndicator size="large" color={theme.colors.error} style={{ marginVertical: 16 }} />
            ) : (
              <>
                <GradientButton tone="danger" style={styles.dangerBtn} onPress={deleteMed} testID="remove-confirm"
                  accessibilityRole="button" accessibilityLabel={`Yes, remove ${remove.name}`}>
                  <AppText style={styles.dangerBtnText}>Yes, remove it</AppText>
                </GradientButton>
                <Pressable style={styles.secondaryBtn} onPress={() => setRemove(null)} testID="remove-cancel"
                  accessibilityRole="button" accessibilityLabel="Keep this medicine">
                  <AppText style={styles.secondaryBtnText}>Keep it</AppText>
                </Pressable>
              </>
            )}
          </View>
        </View>
      )}

      {/* Plain-language explanation of what a medicine is for. */}
      {explain && (
        <View style={styles.backdrop} testID="explain-sheet">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setExplain(null)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.handle} />
            <AppText style={styles.sheetTitle}>{explain.med.name}</AppText>
            {explain.busy ? (
              <View style={{ alignItems: "center", gap: 12, paddingVertical: 20 }}>
                <ActivityIndicator size="large" color={theme.colors.brand} />
                <AppText style={styles.sheetSub}>Looking this up for you...</AppText>
              </View>
            ) : explain.error ? (
              <AppText style={styles.sheetSub}>{explain.error}</AppText>
            ) : explain.data?.unknown ? (
              <AppText style={styles.sheetSub}>
                We don&apos;t recognise this one. Your doctor or pharmacist can tell you what it&apos;s for.
              </AppText>
            ) : (
              <View style={{ alignSelf: "stretch", gap: 14 }}>
                <ExplainRow icon="information-circle" title="What it's for" body={explain.data?.what_for} />
                <ExplainRow icon="time" title="How to take it" body={explain.data?.how_to_take} />
                <ExplainRow icon="alert-circle" title="Tell your doctor if" body={explain.data?.watch_for} />
                <AppText style={styles.disclaimer}>{explain.data?.disclaimer}</AppText>
              </View>
            )}
            <GradientButton tone="brand" style={styles.primaryBtn} onPress={() => setExplain(null)} testID="explain-close"
              accessibilityRole="button" accessibilityLabel="Close">
              <AppText style={styles.primaryBtnText}>Close</AppText>
            </GradientButton>
          </View>
        </View>
      )}

      {/* Weekly walking */}
      {stepsOpen && (
        <View style={styles.backdrop} testID="steps-sheet">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setStepsOpen(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.handle} />
            <AppText style={styles.sheetTitle}>Your week of walking</AppText>

            {!steps.week || steps.week.total === 0 ? (
              <AppText style={styles.sheetSub}>
                No steps recorded yet. Carry your phone with you and your walking will show up here.
              </AppText>
            ) : (
              <>
                <View style={styles.chart} accessibilityRole="image"
                  accessibilityLabel={
                    steps.week.series.map((d) => `${DAY_LABELS[new Date(d.day + "T00:00:00").getDay()]}: ${d.steps} steps`).join(", ")
                  }>
                  {steps.week.series.map((d) => {
                    const peak = Math.max(...steps.week!.series.map((x) => x.steps), steps.week!.goal);
                    const height = peak > 0 ? Math.max(Math.round((d.steps / peak) * 120), d.steps > 0 ? 6 : 3) : 3;
                    const isBest = steps.week!.best_day?.day === d.day && d.steps > 0;
                    const hitGoal = d.steps >= steps.week!.goal;
                    return (
                      <View key={d.day} style={styles.chartCol}>
                        <AppText style={styles.chartValue}>{d.steps > 0 ? d.steps.toLocaleString() : ""}</AppText>
                        <View style={[
                          styles.chartBar,
                          { height },
                          hitGoal && { backgroundColor: theme.colors.success },
                          isBest && { backgroundColor: theme.colors.marigold },
                        ]} />
                        <AppText style={styles.chartLabel}>
                          {DAY_LABELS[new Date(d.day + "T00:00:00").getDay()]}
                        </AppText>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.statRow}>
                  <StepStat label="Best day" value={steps.week.best_day ? steps.week.best_day.steps.toLocaleString() : "—"} />
                  <StepStat label="Daily average" value={steps.week.average.toLocaleString()} />
                  <StepStat label="Goal reached" value={`${steps.week.goal_days} of 7`} />
                </View>

                <AppText style={styles.sheetSub}>
                  {steps.week.best_day
                    ? `Your best day was ${DAY_LABELS[new Date(steps.week.best_day.day + "T00:00:00").getDay()]}, with ${steps.week.best_day.steps.toLocaleString()} steps. That's ${steps.week.total.toLocaleString()} steps across the week.`
                    : `${steps.week.total.toLocaleString()} steps across the week.`}
                </AppText>

                {/* Everyone side by side. Ordered by today's count, framed as
                    encouragement rather than a league table. */}
                {steps.family && steps.family.members.length > 1 && (
                  <View style={styles.familySteps} testID="family-steps">
                    <AppText style={styles.familyTitle}>Your family today</AppText>
                    {steps.family.members.map((m) => {
                      const top = steps.family!.members[0].today || 1;
                      return (
                        <View key={m.id} style={styles.walkerRow} testID={`walker-${m.id}`}
                          accessibilityRole="text"
                          accessibilityLabel={`${m.is_me ? "You" : m.name}, ${m.today.toLocaleString()} steps today`}>
                          <View style={{ flex: 1, gap: 4 }}>
                            <View style={styles.walkerTop}>
                              <AppText style={[styles.walkerName, m.is_me && styles.walkerMe]} numberOfLines={1}>
                                {m.is_me ? "You" : m.name.split(" ")[0]}
                              </AppText>
                              <AppText style={styles.walkerCount}>{m.today.toLocaleString()}</AppText>
                            </View>
                            <View style={styles.walkerTrack}>
                              <View style={[
                                styles.walkerFill,
                                { width: `${Math.max(Math.round((m.today / top) * 100), m.today > 0 ? 6 : 0)}%` },
                                m.today >= steps.family!.goal && { backgroundColor: theme.colors.success },
                              ]} />
                            </View>
                          </View>
                        </View>
                      );
                    })}
                    <AppText style={styles.familyFoot}>
                      {steps.family.leader
                        ? `${steps.family.members[0].is_me ? "You're" : steps.family.leader + " is"} ahead today — ${steps.family.family_total_today.toLocaleString()} steps between you.`
                        : "Nobody has walked yet today."}
                    </AppText>
                  </View>
                )}
              </>
            )}

            <GradientButton tone="brand" style={styles.primaryBtn} onPress={() => setStepsOpen(false)} testID="steps-close"
              accessibilityRole="button" accessibilityLabel="Close">
              <AppText style={styles.primaryBtnText}>Close</AppText>
            </GradientButton>
          </View>
        </View>
      )}

      {/* Undoing a confirmed dose is deliberate, so a mis-tap can't erase it. */}
      {undo && (
        <View style={styles.backdrop} testID="undo-sheet">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setUndo(null)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.handle} />
            <AppText style={styles.sheetTitle}>You already marked {undo.name} as taken</AppText>
            <AppText style={styles.sheetSub}>Did you tap it by mistake?</AppText>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => { setMedTaken(undo.id, false); setUndo(null); }}
              testID="undo-confirm"
              accessibilityRole="button"
              accessibilityLabel={`Undo, I have not taken my ${undo.name}`}
            >
              <AppText style={styles.secondaryBtnText}>No, I haven&apos;t taken it</AppText>
            </Pressable>
            <GradientButton tone="brand"
              style={styles.primaryBtn}
              onPress={() => setUndo(null)}
              testID="undo-keep"
              accessibilityRole="button"
              accessibilityLabel="Keep it marked as taken"
            >
              <AppText style={styles.primaryBtnText}>Keep it, I took it</AppText>
            </GradientButton>
          </View>
        </View>
      )}

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 24 }]} testID="toast" accessibilityLiveRegion="polite">
          <AppText style={styles.toastText}>{toast}</AppText>
        </View>
      ) : null}
    </View>
  );
}

function ExplainRow({ icon, title, body }: { icon: any; title: string; body?: string }) {
  if (!body) return null;
  return (
    <View style={styles.explainRow}>
      <Ionicons name={icon} size={22} color={theme.colors.brand} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <AppText style={styles.explainTitle}>{title}</AppText>
        <AppText style={styles.explainBody}>{body}</AppText>
      </View>
    </View>
  );
}

function StepStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stepStat}>
      <AppText style={styles.stepStatValue}>{value}</AppText>
      <AppText style={styles.stepStatLabel}>{label}</AppText>
    </View>
  );
}

function GridBtn({ image, label, onPress }: any) {
  return (
    <Pressable
      style={styles.gridBtn}
      onPress={onPress}
      testID={`grid-${label}`}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.gridIcon}><Image source={image} style={styles.gridIconArt} contentFit="contain" /></View>
      <AppText style={styles.gridLabel}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  center: { alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  greeting: { fontSize: 26, fontWeight: "800", color: theme.colors.onSurface },
  sub: { fontSize: 17, color: theme.colors.muted, marginTop: 4 },
  intake: { marginHorizontal: 20, borderRadius: 24, overflow: "hidden", padding: 16, gap: 12, borderWidth: 2, borderColor: theme.colors.marigold },
  intakeCentred: { alignItems: "center", gap: 6, paddingVertical: 20 },
  intakeTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  missedBanner: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 20, marginBottom: 14, backgroundColor: theme.colors.error + "16", borderRadius: 20, padding: 16, borderWidth: 1.5, borderColor: theme.colors.error + "55" },
  missedTitle: { fontSize: 17, fontWeight: "800", color: theme.colors.error },
  missedSub: { fontSize: 14, color: theme.colors.onSurfaceSecondary, marginTop: 2, lineHeight: 19 },
  savedRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.colors.brandLight, borderRadius: 12, padding: 10 },
  savedText: { fontSize: 14, fontWeight: "700", color: theme.colors.success, flex: 1 },
  intakeImg: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  intakeImgArt: { width: 38, height: 38 },
  intakeQ: { fontSize: theme.font.md, fontWeight: "800", color: theme.colors.onSurface, lineHeight: 25 },
  intakeMeta: { fontSize: theme.font.sm, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  intakeBtns: { flexDirection: "row", gap: 10, alignSelf: "stretch" },
  intakeBtn: { flex: 1, borderRadius: 999, paddingVertical: 14, minHeight: 56, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  intakeYes: { backgroundColor: theme.colors.success },
  intakeYesText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  intakeNot: { backgroundColor: theme.colors.surface, borderWidth: 2, borderColor: theme.colors.borderStrong },
  intakeNotText: { color: theme.colors.onSurface, fontSize: 18, fontWeight: "700" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginTop: 28, marginBottom: 12 },
  section: { fontSize: 22, fontWeight: "800", color: theme.colors.onSurface, paddingHorizontal: 20, marginTop: 28, marginBottom: 12 },
  // Inside sectionRow the row already supplies the spacing and side padding.
  sectionInRow: { fontSize: 22, fontWeight: "800", color: theme.colors.onSurface },
  scanBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.colors.brandLight, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  scanText: { color: theme.colors.brand, fontWeight: "800", fontSize: 15 },
  medList: { paddingHorizontal: 20, gap: 12 },
  stepsCard: {
    flexDirection: "row", alignItems: "center", gap: 14, marginHorizontal: 20, marginBottom: 14,
    backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.lg, padding: 16,
    borderWidth: 1, borderColor: theme.colors.border, minHeight: 96,
  },
  stepsIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.brandLight,
    alignItems: "center", justifyContent: "center",
  },
  stepsIconArt: { width: 40, height: 40 },
  stepsLabel: { fontSize: theme.font.sm, color: theme.colors.muted, fontWeight: "700" },
  stepsValue: { fontSize: theme.font.xxl, fontWeight: "800", color: theme.colors.onSurface, lineHeight: 38 },
  stepsUnavailable: { fontSize: theme.font.sm, color: theme.colors.onSurfaceSecondary, lineHeight: 21, marginTop: 2 },
  stepsBarTrack: {
    height: 10, borderRadius: 5, backgroundColor: theme.colors.surfaceTertiary,
    overflow: "hidden", marginTop: 6, marginBottom: 4,
  },
  stepsBarFill: { height: "100%", borderRadius: 5, backgroundColor: theme.colors.success },
  stepsGoal: { fontSize: theme.font.xs, color: theme.colors.muted },
  chart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", alignSelf: "stretch", height: 176, paddingTop: 8 },
  chartCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 6 },
  chartValue: { fontSize: 11, color: theme.colors.muted, fontWeight: "700" },
  chartBar: { width: 22, borderRadius: 6, backgroundColor: theme.colors.brand },
  chartLabel: { fontSize: theme.font.xs, color: theme.colors.muted, fontWeight: "700" },
  statRow: { flexDirection: "row", alignSelf: "stretch", gap: 10, marginTop: 4 },
  stepStat: {
    flex: 1, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md,
    padding: 12, alignItems: "center", gap: 2, borderWidth: 1, borderColor: theme.colors.border,
  },
  stepStatValue: { fontSize: theme.font.md, fontWeight: "800", color: theme.colors.onSurface },
  stepStatLabel: { fontSize: theme.font.xs, color: theme.colors.muted, textAlign: "center" },
  familySteps: {
    alignSelf: "stretch", backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.lg, padding: 16, gap: 12, marginTop: 4,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  familyTitle: { fontSize: theme.font.base, fontWeight: "800", color: theme.colors.onSurface },
  walkerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  walkerTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  walkerName: { fontSize: theme.font.sm, fontWeight: "700", color: theme.colors.onSurfaceSecondary, flex: 1 },
  walkerMe: { color: theme.colors.brand, fontWeight: "800" },
  walkerCount: { fontSize: theme.font.sm, fontWeight: "800", color: theme.colors.onSurface, fontVariant: ["tabular-nums"] },
  walkerTrack: { height: 10, borderRadius: 5, backgroundColor: theme.colors.surfaceTertiary, overflow: "hidden" },
  walkerFill: { height: "100%", borderRadius: 5, backgroundColor: theme.colors.brand },
  familyFoot: { fontSize: theme.font.xs, color: theme.colors.muted, lineHeight: 18 },
  choiceCard: {
    alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.lg, padding: 16,
    borderWidth: 2, borderColor: theme.colors.border, minHeight: 92,
  },
  choiceDisabled: { opacity: 0.5 },
  choiceIcon: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: theme.colors.brandLight,
    alignItems: "center", justifyContent: "center",
  },
  choiceTitle: { fontSize: theme.font.base, fontWeight: "800", color: theme.colors.onSurface },
  choiceSub: { fontSize: theme.font.xs, color: theme.colors.onSurfaceSecondary, lineHeight: 19, marginTop: 2 },
  medActions: { gap: 4, alignItems: "center" },
  medAction: { width: 44, height: 40, alignItems: "center", justifyContent: "center" },
  removeIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: theme.colors.error,
    alignItems: "center", justifyContent: "center", marginTop: 4,
  },
  dangerBtn: {
    alignSelf: "stretch", backgroundColor: theme.colors.error, borderRadius: theme.radius.pill,
    paddingVertical: 18, alignItems: "center", minHeight: 60, justifyContent: "center",
  },
  dangerBtnText: { color: "#fff", fontSize: theme.font.md, fontWeight: "800" },
  explainRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  explainTitle: { fontSize: theme.font.sm, fontWeight: "800", color: theme.colors.brand },
  explainBody: { fontSize: theme.font.base, color: theme.colors.onSurface, lineHeight: 24, marginTop: 2 },
  disclaimer: {
    fontSize: theme.font.xs, color: theme.colors.muted, lineHeight: 19, fontStyle: "italic",
    backgroundColor: theme.colors.surfaceTertiary, borderRadius: theme.radius.sm, padding: 12,
  },
  medCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 20, padding: 14, borderWidth: 1, borderColor: theme.colors.border },
  medImg: { width: 56, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  medImgArt: { width: 44, height: 44 },
  medName: { fontSize: 19, fontWeight: "800", color: theme.colors.onSurface },
  struck: { textDecorationLine: "line-through", color: theme.colors.muted },
  medMeta: { fontSize: 15, color: theme.colors.muted, marginTop: 2 },
  stockRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  stockText: { fontSize: 14, color: theme.colors.muted },
  check: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: theme.colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
  sectionEmpty: { fontSize: theme.font.sm, color: theme.colors.muted, paddingHorizontal: 20, lineHeight: 22, marginTop: -4, marginBottom: 4 },
  apptCard: { flexDirection: "row", gap: 14, marginHorizontal: 20, marginBottom: 12, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: theme.colors.border },
  apptIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.brandLight, alignItems: "center", justifyContent: "center" },
  apptDoc: { fontSize: 19, fontWeight: "800", color: theme.colors.onSurface },
  apptSpec: { fontSize: 15, color: theme.colors.muted },
  apptTime: { fontSize: 16, fontWeight: "700", color: theme.colors.brand, marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 20 },
  gridBtn: { width: "47%", backgroundColor: theme.colors.surfaceSecondary, borderRadius: 20, padding: 18, gap: 10, borderWidth: 1, borderColor: theme.colors.border },
  gridIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.brandLight, alignItems: "center", justifyContent: "center" },
  gridIconArt: { width: 34, height: 34 },
  gridLabel: { fontSize: 17, fontWeight: "700", color: theme.colors.onSurface },
  askConcierge: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, marginTop: 16, backgroundColor: theme.colors.marigoldLight, borderRadius: 20, paddingVertical: 18 },
  askConciergeText: { fontSize: 17, fontWeight: "800", color: theme.colors.onSurface },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, alignItems: "center", gap: 14 },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: theme.colors.borderStrong },
  sheetTitle: { fontSize: 22, fontWeight: "800", color: theme.colors.onSurface, textAlign: "center" },
  sheetSub: { fontSize: 16, color: theme.colors.onSurfaceSecondary, textAlign: "center", lineHeight: 22 },
  ocrBusy: { alignItems: "center", gap: 12, paddingVertical: 20 },
  ocrItem: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 14, padding: 14 },
  ocrItemText: { fontSize: 16, fontWeight: "600", color: theme.colors.onSurface, flex: 1 },
  primaryBtn: { backgroundColor: theme.colors.brand, borderRadius: 999, paddingVertical: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", alignSelf: "stretch" },
  primaryBtnText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  secondaryBtn: { backgroundColor: theme.colors.surfaceTertiary, borderRadius: 999, paddingVertical: 16, alignItems: "center", alignSelf: "stretch" },
  secondaryBtnText: { color: theme.colors.onSurface, fontSize: 17, fontWeight: "700" },
  input: { alignSelf: "stretch", fontSize: 18, color: theme.colors.onSurface, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 16, borderWidth: 2, borderColor: theme.colors.border, padding: 16, minHeight: 90, textAlignVertical: "top" },
  sosDone: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.colors.success, alignItems: "center", justifyContent: "center" },
  toast: { position: "absolute", left: 20, right: 20, backgroundColor: theme.colors.surfaceInverse, borderRadius: 16, padding: 16 },
  toastText: { color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center" },
});
