import { useCallback, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, Platform, Linking,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAudioRecorder, AudioModule, RecordingPresets, setAudioModeAsync } from "expo-audio";
import { apiFetch, getToken } from "@/src/api";
import { API, theme } from "@/src/theme";

type Action = { type: "call" | "sos"; target?: string; target_name?: string } | null;
type Msg = { role: "user" | "assistant"; text: string; action?: Action; executed?: string | null };

const EXAMPLES = ["Call my daughter Priya", "Mark my Metformin as taken", "Order my medicines", "Tell my son I'm okay"];

export default function AssistantScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Msg>>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("Tap the big button and just speak");
  const [showType, setShowType] = useState(false);

  const scrollEnd = useCallback(() => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80), []);

  const handleResult = useCallback((data: any) => {
    setMessages((prev) => [
      ...prev,
      { role: "user", text: data.transcript },
      { role: "assistant", text: data.reply, action: data.action || null, executed: data.executed || null },
    ]);
    scrollEnd();
  }, [scrollEnd]);

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

  const startRecording = useCallback(async () => {
    if (Platform.OS === "web") {
      setShowType(true);
      setStatus("Voice works on the phone app. Please type below for now.");
      return;
    }
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setStatus("Microphone is off. Please allow it in Settings.");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setRecording(true);
      setStatus("Listening... tap again when you're done");
    } catch {
      setStatus("Could not start the microphone. Please type below.");
      setShowType(true);
    }
  }, [recorder]);

  const stopAndSend = useCallback(async () => {
    setRecording(false);
    setStatus("Thinking...");
    setBusy(true);
    setTyping(true);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      if (!uri) throw new Error("no audio");
      const token = await getToken();
      const form = new FormData();
      const name = uri.split("/").pop() || "speech.m4a";
      form.append("file", { uri, name, type: "audio/m4a" } as any);
      const res = await fetch(`${API}/agent/voice`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      if (!res.ok) throw new Error("failed");
      handleResult(await res.json());
    } catch {
      setStatus("Sorry, I couldn't hear that. Tap to try again.");
      setMessages((prev) => [...prev, { role: "assistant", text: "I couldn't hear you clearly. Please try again or type below." }]);
    } finally {
      setBusy(false); setTyping(false);
      setStatus("Tap the big button and just speak");
      scrollEnd();
    }
  }, [recorder, handleResult, scrollEnd]);

  const micPress = () => (recording ? stopAndSend() : startRecording());

  const runAction = useCallback((action: Action) => {
    if (!action) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    if (action.type === "call") {
      router.push({ pathname: "/call", params: { name: action.target_name || "Family", who: action.target || "daughter" } });
    }
  }, [router]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.hBtn} testID="assistant-back">
          <Ionicons name="chevron-down" size={28} color={theme.colors.onSurface} />
        </Pressable>
        <View style={styles.hCenter}>
          <View style={styles.hSun}><Ionicons name="sunny" size={22} color="#fff" /></View>
          <View>
            <Text style={styles.hTitle}>Ask Sunshine</Text>
            <Text style={styles.hSub}>Just talk to me</Text>
          </View>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "translate-with-padding"}>
        {messages.length === 0 ? (
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>Hello, Kamala!</Text>
            <Text style={styles.heroText}>I can call your family, send messages, mark medicines, order refills, book a doctor and more. Just tell me.</Text>
            <View style={styles.chips}>
              {EXAMPLES.map((e) => (
                <Pressable key={e} style={styles.chip} onPress={() => sendText(e)} testID={`assistant-example-${e}`}>
                  <Text style={styles.chipText}>{e}</Text>
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
            renderItem={({ item }) => <Bubble msg={item} onAction={() => runAction(item.action || null)} />}
            ListFooterComponent={typing ? (
              <View style={[styles.bubble, styles.bubbleA, styles.typing]}>
                <ActivityIndicator size="small" color={theme.colors.brand} />
                <Text style={styles.typingText}>Sunshine is thinking...</Text>
              </View>
            ) : null}
          />
        )}

        {/* Mic zone */}
        <View style={[styles.micZone, { paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 16 }]}>
          <Text style={styles.status}>{status}</Text>
          <Pressable
            style={[styles.mic, recording && styles.micRec, busy && !recording && styles.micBusy]}
            onPress={micPress}
            disabled={busy && !recording}
            testID="agent-mic"
          >
            {busy && !recording ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : (
              <Ionicons name={recording ? "stop" : "mic"} size={52} color="#fff" />
            )}
          </Pressable>

          {status.includes("Settings") && (
            <Pressable style={styles.settingsBtn} onPress={() => Linking.openSettings()} testID="assistant-settings">
              <Text style={styles.settingsText}>Open Settings</Text>
            </Pressable>
          )}

          {!showType ? (
            <Pressable onPress={() => setShowType(true)} testID="assistant-show-type">
              <Text style={styles.typeToggle}>or type instead</Text>
            </Pressable>
          ) : (
            <View style={styles.inputRow}>
              <TextInput style={styles.input} placeholder="Type your message..." placeholderTextColor={theme.colors.muted} value={input} onChangeText={setInput} testID="assistant-input" />
              <Pressable style={[styles.send, (!input.trim() || busy) && { opacity: 0.5 }]} onPress={() => sendText(input)} disabled={!input.trim() || busy} testID="assistant-send">
                <Ionicons name="arrow-up" size={24} color="#fff" />
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Bubble({ msg, onAction }: { msg: Msg; onAction: () => void }) {
  const isUser = msg.role === "user";
  return (
    <View>
      <View style={[styles.row, isUser ? styles.rowR : styles.rowL]}>
        {!isUser && <View style={styles.av}><Ionicons name="sunny" size={16} color="#fff" /></View>}
        <View style={[styles.bubble, isUser ? styles.bubbleU : styles.bubbleA]}>
          <Text style={[styles.bubbleText, isUser && { color: "#fff" }]}>{msg.text}</Text>
        </View>
      </View>
      {msg.executed && (
        <View style={styles.done}>
          <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
          <Text style={styles.doneText}>{msg.executed}</Text>
        </View>
      )}
      {msg.action?.type === "call" && (
        <Pressable style={styles.actionCard} onPress={onAction} testID="assistant-call-action">
          <View style={styles.actionIcon}><Ionicons name="call" size={22} color="#fff" /></View>
          <Text style={styles.actionText}>Call {msg.action.target_name}</Text>
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
  hTitle: { fontSize: 20, fontWeight: "800", color: theme.colors.onSurface },
  hSub: { fontSize: 13, color: theme.colors.muted },
  hero: { flex: 1, padding: 24, justifyContent: "center", gap: 12 },
  heroTitle: { fontSize: 28, fontWeight: "800", color: theme.colors.onSurface },
  heroText: { fontSize: 18, lineHeight: 25, color: theme.colors.onSurfaceSecondary },
  chips: { gap: 10, marginTop: 8 },
  chip: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.colors.border },
  chipText: { fontSize: 17, fontWeight: "600", color: theme.colors.onSurface },
  list: { padding: 16, gap: 12, paddingBottom: 20 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  rowL: { justifyContent: "flex-start" },
  rowR: { justifyContent: "flex-end" },
  av: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center" },
  bubble: { maxWidth: "82%", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 22 },
  bubbleU: { backgroundColor: theme.colors.brand, borderBottomRightRadius: 6 },
  bubbleA: { backgroundColor: theme.colors.surfaceSecondary, borderBottomLeftRadius: 6 },
  bubbleText: { fontSize: 18, lineHeight: 25, color: theme.colors.onSurface },
  typing: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "flex-start", marginLeft: 38 },
  typingText: { fontSize: 15, color: theme.colors.muted, fontWeight: "600" },
  done: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 38, marginTop: 8 },
  doneText: { fontSize: 15, fontWeight: "700", color: theme.colors.success },
  actionCard: { flexDirection: "row", alignItems: "center", gap: 12, marginLeft: 38, marginTop: 8, backgroundColor: theme.colors.brandLight, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: theme.colors.brand },
  actionIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center" },
  actionText: { fontSize: 17, fontWeight: "800", color: theme.colors.onSurface, flex: 1 },
  micZone: { alignItems: "center", paddingTop: 12, paddingHorizontal: 20, gap: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface },
  status: { fontSize: 16, fontWeight: "600", color: theme.colors.onSurfaceSecondary, textAlign: "center" },
  mic: { width: 96, height: 96, borderRadius: 48, backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center", shadowColor: theme.colors.brand, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  micRec: { backgroundColor: theme.colors.error },
  micBusy: { backgroundColor: theme.colors.muted },
  settingsBtn: { backgroundColor: theme.colors.brand, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  settingsText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  typeToggle: { fontSize: 16, color: theme.colors.brand, fontWeight: "700", paddingVertical: 4 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "stretch" },
  input: { flex: 1, fontSize: 17, color: theme.colors.onSurface, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 12, minHeight: 50 },
  send: { width: 50, height: 50, borderRadius: 25, backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center" },
});
