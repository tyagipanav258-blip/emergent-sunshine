import { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, Platform, Linking } from "react-native";
import { AppText } from "@/src/components/AppText";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { apiFetch } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useRecorder } from "@/src/hooks/use-recorder";
import { useSpeech } from "@/src/hooks/use-speech";
import { theme } from "@/src/theme";

type Action =
  | { type: "call"; target?: string; target_name?: string; confirm?: boolean }
  | { type: "sos"; confirm?: boolean }
  | { type: "voice_note"; target: string; target_name: string }
  | { type: "invite" }
  | null;

type Msg = { role: "user" | "assistant"; text: string; action?: Action; executed?: string | null };

type SosResult = { delivered: boolean; message: string; contacts_notified: string[]; emergency_number?: string };

/** A consequential action, held until the elder says or taps yes. */
type Pending =
  | { kind: "call"; name: string; who: string }
  | { kind: "sos" }
  | null;

/** The voice-note recorder, opened when the agent resolves that intent. */
type NoteState =
  | { stage: "idle"; toId: string; toName: string }
  | { stage: "recording"; toId: string; toName: string }
  | { stage: "sending"; toId: string; toName: string }
  | { stage: "sent"; toId: string; toName: string }
  | { stage: "error"; toId: string; toName: string; message: string }
  | null;

const EXAMPLES = [
  "Send a voice note to my daughter",
  "Add Metformin 500 mg at 8 in the morning",
  "Mark my Metformin as taken",
  "Order my medicines",
];

export default function AssistantScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Msg>>(null);
  const { user } = useAuth();
  const rec = useRecorder();
  const speech = useSpeech();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Tap the big button and just speak");
  const [showType, setShowType] = useState(Platform.OS === "web");
  const [pending, setPending] = useState<Pending>(null);
  const [note, setNote] = useState<NoteState>(null);
  const [confirmHeard, setConfirmHeard] = useState("");
  const [sos, setSos] = useState<SosResult | null>(null);

  const firstName = user?.name?.split(" ")[0] || "";

  const scrollEnd = useCallback(() => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80), []);

  // Anything the agent flagged `confirm` is held here instead of firing.
  const stage = useCallback((action: Action) => {
    if (!action) return;
    if (action.type === "call" && action.confirm) {
      setPending({ kind: "call", name: action.target_name || "your family", who: action.target || "" });
    } else if (action.type === "sos") {
      setPending({ kind: "sos" });
    } else if (action.type === "voice_note") {
      setNote({ stage: "idle", toId: action.target, toName: action.target_name });
    }
  }, []);

  const handleResult = useCallback((data: any) => {
    setMessages((prev) => [
      ...prev,
      { role: "user", text: data.transcript },
      { role: "assistant", text: data.reply, action: data.action || null, executed: data.executed || null },
    ]);
    speech.speak(data.reply);
    stage(data.action || null);
    scrollEnd();
  }, [scrollEnd, speech, stage]);

  const sendText = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || busy) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setInput("");
    setTyping(true);
    setBusy(true);
    try {
      const data = await apiFetch<any>("/agent/text", { method: "POST", body: { message: msg } });
      handleResult(data);
    } catch {
      setMessages((prev) => [...prev, { role: "user", text: msg }, { role: "assistant", text: "Sorry, I had trouble. Please try again." }]);
    } finally {
      setTyping(false); setBusy(false); scrollEnd();
    }
  }, [busy, handleResult, scrollEnd]);

  const startAsk = useCallback(async () => {
    speech.stop();
    const ok = await rec.start();
    if (!ok) {
      setShowType(true);
      setStatus(
        rec.error === "unsupported" ? "Voice works on the phone app. Please type below for now."
          : rec.error === "permission" ? "Microphone is off. Please allow it in Settings."
            : "Could not start the microphone. Please type below."
      );
      return;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStatus("Listening... tap again when you're done");
  }, [rec, speech]);

  const stopAsk = useCallback(async () => {
    setStatus("Thinking...");
    setBusy(true);
    setTyping(true);
    try {
      const uri = await rec.stop();
      if (!uri) throw new Error("no audio");
      handleResult(await rec.upload("/agent/voice", uri));
    } catch {
      setStatus("Sorry, I couldn't hear that. Tap to try again.");
      setMessages((prev) => [...prev, { role: "assistant", text: "I couldn't hear you clearly. Please try again or type below." }]);
    } finally {
      setBusy(false); setTyping(false);
      setStatus("Tap the big button and just speak");
      scrollEnd();
    }
  }, [rec, handleResult, scrollEnd]);

  const micPress = () => (rec.recording ? stopAsk() : startAsk());

  // ---- Confirmation ----------------------------------------------------
  const runPending = useCallback(async () => {
    const p = pending;
    setPending(null);
    setConfirmHeard("");
    if (!p) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    if (p.kind === "call") {
      router.push({ pathname: "/call", params: { name: p.name, who: p.who } });
      return;
    }
    try {
      const r = await apiFetch<SosResult>("/sos", { method: "POST" });
      setSos(r);
      speech.speak(r.message);
    } catch {
      setSos({
        delivered: false,
        message: "We could not reach the network, so nobody was alerted. Please call for help directly.",
        contacts_notified: [],
        emergency_number: "112",
      });
    }
  }, [pending, router, speech]);

  /** Answer the confirmation by voice: "yes, do it" / "no". */
  const confirmByVoice = useCallback(async () => {
    if (rec.recording) {
      const uri = await rec.stop();
      if (!uri) return;
      setConfirmHeard("Checking...");
      try {
        const r = await rec.upload("/agent/confirm", uri);
        setConfirmHeard(r.transcript ? `You said: "${r.transcript}"` : "");
        if (r.answer === true) runPending();
        else if (r.answer === false) { setPending(null); setConfirmHeard(""); }
        else setConfirmHeard("Sorry, I didn't catch that. Please say yes or no, or use the buttons.");
      } catch {
        setConfirmHeard("I couldn't hear that. Please use the buttons.");
      }
      return;
    }
    speech.stop();
    const ok = await rec.start();
    if (!ok) setConfirmHeard("Voice isn't available here. Please use the buttons.");
    else setConfirmHeard("Listening... say yes or no");
  }, [rec, runPending, speech]);

  // ---- Voice notes -----------------------------------------------------
  const noteRecord = useCallback(async () => {
    if (!note) return;
    speech.stop();
    const ok = await rec.start();
    if (!ok) {
      setNote({
        ...note,
        stage: "error",
        message: rec.error === "unsupported"
          ? "Recording works on the phone app."
          : "Microphone is off. Please allow it in Settings.",
      });
      return;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setNote({ ...note, stage: "recording" });
  }, [note, rec, speech]);

  const noteSend = useCallback(async () => {
    if (!note) return;
    setNote({ ...note, stage: "sending" });
    try {
      const uri = await rec.stop();
      if (!uri) throw new Error("no audio");
      await rec.upload("/family/voice-notes", uri, { to_user_id: note.toId });
      setNote({ ...note, stage: "sent" });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Your voice note is on its way to ${note.toName}.`, executed: `Voice note sent to ${note.toName}` },
      ]);
      speech.speak(`Your voice note is on its way to ${note.toName}.`);
      scrollEnd();
    } catch {
      setNote({ ...note, stage: "error", message: "That didn't send. Please try recording again." });
    }
  }, [note, rec, speech, scrollEnd]);

  const noteCancel = useCallback(async () => {
    if (note?.stage === "recording") await rec.stop();
    setNote(null);
  }, [note, rec]);

  useEffect(() => () => speech.stop(), [speech]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.hBtn} testID="assistant-back"
          accessibilityRole="button" accessibilityLabel="Close Sunshine">
          <Ionicons name="chevron-down" size={28} color={theme.colors.onSurface} />
        </Pressable>
        <View style={styles.hCenter}>
          <View style={styles.hSun}><Ionicons name="sunny" size={22} color="#fff" /></View>
          <View>
            <AppText style={styles.hTitle}>Ask Sunshine</AppText>
            <AppText style={styles.hSub}>Just talk to me</AppText>
          </View>
        </View>
        <Pressable
          onPress={speech.toggle}
          hitSlop={12}
          style={styles.hBtn}
          testID="assistant-speaker-toggle"
          accessibilityRole="switch"
          accessibilityState={{ checked: speech.enabled }}
          accessibilityLabel={speech.enabled ? "Sunshine reads replies aloud" : "Replies are silent"}
          accessibilityHint="Turns the spoken replies on or off"
        >
          <Ionicons
            name={speech.enabled ? "volume-high" : "volume-mute"}
            size={26}
            color={speech.enabled ? theme.colors.brand : theme.colors.muted}
          />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "translate-with-padding"}>
        {messages.length === 0 ? (
          <View style={styles.hero}>
            <AppText style={styles.heroTitle}>Hello{firstName ? `, ${firstName}` : ""}!</AppText>
            <AppText style={styles.heroText}>
              I can send a voice note to your family, add a medicine you tell me about, mark medicines as taken,
              order refills and call for help. Just say it.
            </AppText>
            <View style={styles.chips}>
              {EXAMPLES.map((e) => (
                <Pressable key={e} style={styles.chip} onPress={() => sendText(e)} testID={`assistant-example-${e}`}
                  accessibilityRole="button" accessibilityLabel={e}>
                  <AppText style={styles.chipText}>{e}</AppText>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={scrollEnd}
            renderItem={({ item }) => (
              <Bubble
                msg={item}
                onAction={() => stage(item.action || null)}
                onInvite={() => router.replace("/(elder)/profile")}
              />
            )}
            ListFooterComponent={typing ? (
              <View style={[styles.bubble, styles.bubbleA, styles.typing]}>
                <ActivityIndicator size="small" color={theme.colors.brand} />
                <AppText style={styles.typingText}>Sunshine is thinking...</AppText>
              </View>
            ) : null}
          />
        )}

        {/* Mic zone */}
        <View style={[styles.micZone, { paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 16 }]}>
          <AppText style={styles.status} accessibilityLiveRegion="polite">{status}</AppText>
          <Pressable
            style={[styles.mic, rec.recording && styles.micRec, busy && !rec.recording && styles.micBusy]}
            onPress={micPress}
            disabled={busy && !rec.recording}
            testID="agent-mic"
            accessibilityRole="button"
            accessibilityLabel={rec.recording ? "Stop and send what you said" : "Hold a conversation with Sunshine"}
          >
            {busy && !rec.recording ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : (
              <Ionicons name={rec.recording ? "stop" : "mic"} size={52} color="#fff" />
            )}
          </Pressable>

          {status.includes("Settings") && (
            <Pressable style={styles.settingsBtn} onPress={() => Linking.openSettings()} testID="assistant-settings"
              accessibilityRole="button" accessibilityLabel="Open Settings">
              <AppText style={styles.settingsText}>Open Settings</AppText>
            </Pressable>
          )}

          {!showType ? (
            <Pressable onPress={() => setShowType(true)} testID="assistant-show-type"
              accessibilityRole="button" accessibilityLabel="Type instead of speaking">
              <AppText style={styles.typeToggle}>or type instead</AppText>
            </Pressable>
          ) : (
            <View style={styles.inputRow}>
              <TextInput style={styles.input} placeholder="Type your message..." placeholderTextColor={theme.colors.muted}
                value={input} onChangeText={setInput} testID="assistant-input" accessibilityLabel="Message for Sunshine" />
              <Pressable style={[styles.send, (!input.trim() || busy) && { opacity: 0.5 }]} onPress={() => sendText(input)}
                disabled={!input.trim() || busy} testID="assistant-send"
                accessibilityRole="button" accessibilityLabel="Send message">
                <Ionicons name="arrow-up" size={24} color="#fff" />
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Confirm before anything consequential happens */}
      {pending && (
        <View style={styles.backdrop} testID="confirm-sheet">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setPending(null); setConfirmHeard(""); }}
            accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.handle} />
            <View style={[styles.sheetIcon, pending.kind === "sos" && { backgroundColor: theme.colors.error }]}>
              <Ionicons name={pending.kind === "sos" ? "alert-circle" : "call"} size={40} color="#fff" />
            </View>
            <AppText style={styles.sheetTitle}>
              {pending.kind === "sos" ? "Do you need help?" : `Call ${pending.name}?`}
            </AppText>
            <AppText style={styles.sheetSub}>
              {pending.kind === "sos"
                ? "We will alert the family connected to your account."
                : "Say “yes, do it” or tap the button below."}
            </AppText>

            <Pressable
              style={[styles.confirmBtn, pending.kind === "sos" && { backgroundColor: theme.colors.error }]}
              onPress={runPending}
              testID="confirm-yes"
              accessibilityRole="button"
              accessibilityLabel={pending.kind === "sos" ? "Yes, alert my family" : `Yes, call ${pending.name}`}
            >
              <AppText style={styles.confirmBtnText}>
                {pending.kind === "sos" ? "Yes, alert my family" : "Yes, do it"}
              </AppText>
            </Pressable>

            <Pressable
              style={[styles.voiceConfirmBtn, rec.recording && styles.voiceConfirmOn]}
              onPress={confirmByVoice}
              testID="confirm-by-voice"
              accessibilityRole="button"
              accessibilityLabel={rec.recording ? "Stop listening and check your answer" : "Answer by voice"}
            >
              <Ionicons name={rec.recording ? "stop" : "mic"} size={22} color={rec.recording ? "#fff" : theme.colors.brand} />
              <AppText style={[styles.voiceConfirmText, rec.recording && { color: "#fff" }]}>
                {rec.recording ? "Tap when you've answered" : "Answer by voice"}
              </AppText>
            </Pressable>

            {confirmHeard ? (
              <AppText style={styles.heard} accessibilityLiveRegion="polite" testID="confirm-heard">{confirmHeard}</AppText>
            ) : null}

            <Pressable style={styles.cancelBtn} onPress={() => { setPending(null); setConfirmHeard(""); }}
              testID="confirm-no" accessibilityRole="button" accessibilityLabel="No, cancel">
              <AppText style={styles.cancelBtnText}>No, cancel</AppText>
            </Pressable>
          </View>
        </View>
      )}

      {/* Record a voice note for a family member */}
      {note && (
        <View style={styles.backdrop} testID="voice-note-sheet">
          <Pressable style={StyleSheet.absoluteFill} onPress={noteCancel} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.handle} />

            {note.stage === "sent" ? (
              <>
                <View style={[styles.sheetIcon, { backgroundColor: theme.colors.success }]}>
                  <Ionicons name="checkmark" size={40} color="#fff" />
                </View>
                <AppText style={styles.sheetTitle}>Sent to {note.toName}</AppText>
                <AppText style={styles.sheetSub}>They will hear it next time they open Sunshine.</AppText>
                <Pressable style={styles.confirmBtn} onPress={() => setNote(null)} testID="note-done"
                  accessibilityRole="button" accessibilityLabel="Done">
                  <AppText style={styles.confirmBtnText}>Done</AppText>
                </Pressable>
              </>
            ) : (
              <>
                <View style={[styles.sheetIcon, note.stage === "recording" && { backgroundColor: theme.colors.error }]}>
                  <Ionicons name="mic" size={40} color="#fff" />
                </View>
                <AppText style={styles.sheetTitle}>Voice note for {note.toName}</AppText>
                <AppText style={styles.sheetSub}>
                  {note.stage === "recording" ? "I'm listening. Tap send when you've finished."
                    : note.stage === "sending" ? "Sending your note..."
                      : note.stage === "error" ? note.message
                        : "Tap record and say your message. Keep it under a minute."}
                </AppText>

                {note.stage === "sending" ? (
                  <ActivityIndicator size="large" color={theme.colors.brand} style={{ marginVertical: 16 }} />
                ) : note.stage === "recording" ? (
                  <Pressable style={styles.confirmBtn} onPress={noteSend} testID="note-send"
                    accessibilityRole="button" accessibilityLabel={`Send this voice note to ${note.toName}`}>
                    <Ionicons name="send" size={22} color="#fff" />
                    <AppText style={styles.confirmBtnText}>  Send to {note.toName}</AppText>
                  </Pressable>
                ) : (
                  <Pressable style={styles.confirmBtn} onPress={noteRecord} testID="note-record"
                    accessibilityRole="button" accessibilityLabel="Start recording your voice note">
                    <Ionicons name="mic" size={22} color="#fff" />
                    <AppText style={styles.confirmBtnText}>  Record</AppText>
                  </Pressable>
                )}

                <Pressable style={styles.cancelBtn} onPress={noteCancel} testID="note-cancel"
                  accessibilityRole="button" accessibilityLabel="Cancel this voice note">
                  <AppText style={styles.cancelBtnText}>Cancel</AppText>
                </Pressable>
              </>
            )}
          </View>
        </View>
      )}

      {/* Result of an SOS raised by voice */}
      {sos && (
        <View style={styles.backdrop} testID="assistant-sos-result">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSos(null)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.handle} />
            <View style={[styles.sheetIcon, { backgroundColor: sos.delivered ? theme.colors.success : theme.colors.error }]}>
              <Ionicons name={sos.delivered ? "shield-checkmark" : "warning"} size={40} color="#fff" />
            </View>
            <AppText style={styles.sheetTitle}>
              {sos.delivered ? "Your family has been alerted" : "Nobody could be alerted"}
            </AppText>
            <AppText style={styles.sheetSub}>{sos.message}</AppText>
            {sos.emergency_number && (
              <Pressable
                style={[styles.confirmBtn, { backgroundColor: theme.colors.error }]}
                onPress={() => Linking.openURL(`tel:${sos.emergency_number}`).catch(() => {})}
                testID="assistant-call-emergency"
                accessibilityRole="button"
                accessibilityLabel={`Call emergency services on ${sos.emergency_number}`}
              >
                <Ionicons name="call" size={22} color="#fff" />
                <AppText style={styles.confirmBtnText}>  Call {sos.emergency_number} now</AppText>
              </Pressable>
            )}
            <Pressable style={styles.cancelBtn} onPress={() => setSos(null)} testID="assistant-sos-close"
              accessibilityRole="button" accessibilityLabel="Close">
              <AppText style={styles.cancelBtnText}>Close</AppText>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function Bubble({ msg, onAction, onInvite }: { msg: Msg; onAction: () => void; onInvite: () => void }) {
  const isUser = msg.role === "user";
  const a = msg.action;
  return (
    <View>
      <View style={[styles.row, isUser ? styles.rowR : styles.rowL]}>
        {!isUser && <View style={styles.av}><Ionicons name="sunny" size={16} color="#fff" /></View>}
        <View style={[styles.bubble, isUser ? styles.bubbleU : styles.bubbleA]}>
          <AppText style={[styles.bubbleText, isUser && { color: "#fff" }]}>{msg.text}</AppText>
        </View>
      </View>
      {msg.executed && (
        <View style={styles.done}>
          <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
          <AppText style={styles.doneText}>{msg.executed}</AppText>
        </View>
      )}
      {a?.type === "call" && (
        <Pressable style={styles.actionCard} onPress={onAction} testID="assistant-call-action"
          accessibilityRole="button" accessibilityLabel={`Call ${a.target_name}`}>
          <View style={styles.actionIcon}><Ionicons name="call" size={22} color="#fff" /></View>
          <AppText style={styles.actionText}>Call {a.target_name}</AppText>
          <Ionicons name="arrow-forward-circle" size={28} color={theme.colors.brand} />
        </Pressable>
      )}
      {a?.type === "voice_note" && (
        <Pressable style={styles.actionCard} onPress={onAction} testID="assistant-voice-note-action"
          accessibilityRole="button" accessibilityLabel={`Record a voice note for ${a.target_name}`}>
          <View style={styles.actionIcon}><Ionicons name="mic" size={22} color="#fff" /></View>
          <AppText style={styles.actionText}>Record for {a.target_name}</AppText>
          <Ionicons name="arrow-forward-circle" size={28} color={theme.colors.brand} />
        </Pressable>
      )}
      {a?.type === "invite" && (
        <Pressable style={styles.actionCard} onPress={onInvite} testID="assistant-invite-action"
          accessibilityRole="button" accessibilityLabel="Invite your family">
          <View style={styles.actionIcon}><Ionicons name="person-add" size={22} color="#fff" /></View>
          <AppText style={styles.actionText}>Invite your family</AppText>
          <Ionicons name="arrow-forward-circle" size={28} color={theme.colors.brand} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  hBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  hCenter: { flexDirection: "row", alignItems: "center", gap: 10 },
  hSun: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center" },
  hTitle: { fontSize: theme.font.md, fontWeight: "800", color: theme.colors.onSurface },
  hSub: { fontSize: theme.font.xs, color: theme.colors.muted },
  hero: { flex: 1, padding: 24, justifyContent: "center", gap: 12 },
  heroTitle: { fontSize: theme.font.xl, fontWeight: "800", color: theme.colors.onSurface },
  heroText: { fontSize: theme.font.base, lineHeight: 25, color: theme.colors.onSurfaceSecondary },
  chips: { gap: 10, marginTop: 8 },
  chip: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.colors.border, minHeight: 56, justifyContent: "center" },
  chipText: { fontSize: theme.font.base, fontWeight: "600", color: theme.colors.onSurface },
  list: { padding: 16, gap: 12, paddingBottom: 20 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  rowL: { justifyContent: "flex-start" },
  rowR: { justifyContent: "flex-end" },
  av: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center" },
  bubble: { maxWidth: "82%", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 22 },
  bubbleU: { backgroundColor: theme.colors.brand, borderBottomRightRadius: 6 },
  bubbleA: { backgroundColor: theme.colors.surfaceSecondary, borderBottomLeftRadius: 6 },
  bubbleText: { fontSize: theme.font.base, lineHeight: 25, color: theme.colors.onSurface },
  typing: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "flex-start", marginLeft: 38 },
  typingText: { fontSize: theme.font.sm, color: theme.colors.muted, fontWeight: "600" },
  done: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 38, marginTop: 8 },
  doneText: { fontSize: theme.font.sm, fontWeight: "700", color: theme.colors.success },
  actionCard: { flexDirection: "row", alignItems: "center", gap: 12, marginLeft: 38, marginTop: 8, backgroundColor: theme.colors.brandLight, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: theme.colors.brand, minHeight: 64 },
  actionIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center" },
  actionText: { fontSize: theme.font.base, fontWeight: "800", color: theme.colors.onSurface, flex: 1 },
  micZone: { alignItems: "center", paddingTop: 12, paddingHorizontal: 20, gap: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface },
  status: { fontSize: theme.font.base, fontWeight: "600", color: theme.colors.onSurfaceSecondary, textAlign: "center" },
  mic: { width: 96, height: 96, borderRadius: 48, backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center", shadowColor: theme.colors.brand, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  micRec: { backgroundColor: theme.colors.error },
  micBusy: { backgroundColor: theme.colors.muted },
  settingsBtn: { backgroundColor: theme.colors.brand, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, minHeight: 48, justifyContent: "center" },
  settingsText: { color: "#fff", fontWeight: "800", fontSize: theme.font.sm },
  typeToggle: { fontSize: theme.font.base, color: theme.colors.brand, fontWeight: "700", paddingVertical: 8 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "stretch" },
  input: { flex: 1, fontSize: theme.font.base, color: theme.colors.onSurface, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 12, minHeight: 50 },
  send: { width: 50, height: 50, borderRadius: 25, backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, alignItems: "center", gap: 12 },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: theme.colors.borderStrong },
  sheetIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center", marginTop: 8 },
  sheetTitle: { fontSize: theme.font.lg, fontWeight: "800", color: theme.colors.onSurface, textAlign: "center" },
  sheetSub: { fontSize: theme.font.base, color: theme.colors.onSurfaceSecondary, textAlign: "center", lineHeight: 24 },
  confirmBtn: { alignSelf: "stretch", flexDirection: "row", backgroundColor: theme.colors.brand, borderRadius: theme.radius.pill, paddingVertical: 18, alignItems: "center", justifyContent: "center", marginTop: 8, minHeight: 60 },
  confirmBtnText: { color: "#fff", fontSize: theme.font.md, fontWeight: "800" },
  voiceConfirmBtn: { alignSelf: "stretch", flexDirection: "row", gap: 10, backgroundColor: theme.colors.brandLight, borderRadius: theme.radius.pill, paddingVertical: 16, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.colors.brand, minHeight: 56 },
  voiceConfirmOn: { backgroundColor: theme.colors.error, borderColor: theme.colors.error },
  voiceConfirmText: { color: theme.colors.brand, fontSize: theme.font.base, fontWeight: "800" },
  heard: { fontSize: theme.font.sm, color: theme.colors.onSurfaceSecondary, textAlign: "center" },
  cancelBtn: { alignSelf: "stretch", backgroundColor: theme.colors.surfaceTertiary, borderRadius: theme.radius.pill, paddingVertical: 18, alignItems: "center", minHeight: 60 },
  cancelBtnText: { color: theme.colors.onSurface, fontSize: theme.font.md, fontWeight: "700" },
});
