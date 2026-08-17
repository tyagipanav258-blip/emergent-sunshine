import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator, Platform, TextInput } from "react-native";
import { AppText } from "@/src/components/AppText";
import { GradientFill } from "@/src/components/GradientFill";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { apiFetch } from "@/src/api";
import { useRecorder } from "@/src/hooks/use-recorder";
import { theme } from "@/src/theme";

type Template = { id: string; text: string; icon: any; group: string };
type Group = { id: string; label: string };
type Message = {
  id: string; text: string; mine: boolean; at: string;
  from_name?: string; template_id?: string | null;
};

/**
 * Saying something to one person, without typing.
 *
 * Typing is the hardest thing this app asks of anyone, and most of what a family
 * sends each other is the same handful of sentences. So the two fastest things —
 * a ready-made message and a voice note — are one tap each, and the keyboard is
 * there only for anything else.
 */
export function QuickConnect({ memberId, memberName }: { memberId: string; memberName: string }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [noteState, setNoteState] = useState<"idle" | "recording" | "sending" | "sent">("idle");
  const [noteError, setNoteError] = useState<string | null>(null);
  const rec = useRecorder();
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(async () => {
    try {
      const [t, m] = await Promise.all([
        apiFetch<{ groups: Group[]; messages: Template[] }>("/family/quick-messages"),
        apiFetch<{ messages: Message[] }>(`/family/messages?member_id=${memberId}`),
      ]);
      if (!mounted.current) return;
      setGroups(t.groups || []);
      setTemplates(t.messages || []);
      setMessages(m.messages || []);
      apiFetch(`/family/messages/read?member_id=${memberId}`, { method: "POST" }).catch(() => {});
    } catch {
      // The templates are the useful half; an empty thread is not an error.
    }
    if (mounted.current) setLoading(false);
  }, [memberId]);

  useEffect(() => { load(); }, [load]);

  const send = useCallback(async (template_id?: string, text?: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const key = template_id || "typed";
    setSendingId(key);
    // Show it immediately — the send is a formality on a good connection.
    const optimistic: Message = {
      id: `pending-${key}-${Date.now()}`,
      text: text || templates.find((t) => t.id === template_id)?.text || "",
      mine: true, at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const saved = await apiFetch<Message>("/family/messages", {
        method: "POST", body: { to_user_id: memberId, template_id, text },
      });
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? { ...saved, mine: true } : m)));
      setTyped("");
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    }
    setSendingId(null);
  }, [memberId, templates]);

  const toggleNote = useCallback(async () => {
    setNoteError(null);
    if (noteState === "recording") {
      setNoteState("sending");
      const uri = await rec.stop();
      if (!uri) {
        setNoteState("idle");
        setNoteError("Nothing was recorded. Please try again.");
        return;
      }
      try {
        await rec.upload("/family/voice-notes", uri, { to_user_id: memberId });
        setNoteState("sent");
        setTimeout(() => mounted.current && setNoteState("idle"), 2600);
      } catch {
        setNoteState("idle");
        setNoteError("Could not send that note. Please try again.");
      }
      return;
    }
    const ok = await rec.start();
    if (!ok) {
      setNoteError(
        rec.error === "unsupported" ? "Voice notes work in the Sunshine app on your phone."
          : rec.error === "permission" ? "Microphone is off. Please allow it in Settings."
            : "Could not start the microphone."
      );
      return;
    }
    setNoteState("recording");
  }, [noteState, rec, memberId]);

  const shown = useMemo(() => (showAll ? messages : messages.slice(-4)), [messages, showAll]);
  const firstName = (memberName || "them").split(" ")[0];

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color={theme.colors.brand} /></View>;
  }

  return (
    <View style={styles.wrap} testID="quick-connect">
      <AppText style={styles.section}>Say something to {firstName}</AppText>

      {/* One tap, one whole message. */}
      {groups.map((g) => {
        const items = templates.filter((t) => t.group === g.id);
        if (!items.length) return null;
        return (
          <View key={g.id} style={{ gap: 8 }}>
            <AppText style={styles.groupLabel}>{g.label}</AppText>
            {/* Wrapped, not a horizontal scroller: every phrase has to be
                visible without discovering that the row slides. */}
            <View style={styles.chipRow}>
              {items.map((t) => (
                <Pressable
                  key={t.id}
                  style={styles.chip}
                  onPress={() => send(t.id)}
                  disabled={sendingId !== null}
                  testID={`quick-${t.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Send "${t.text}" to ${firstName}`}
                >
                  {sendingId === t.id
                    ? <ActivityIndicator size="small" color={theme.colors.brand} />
                    : <Ionicons name={t.icon} size={20} color={theme.colors.brand} />}
                  <AppText style={styles.chipText}>{t.text}</AppText>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}

      {/* The other one-tap route: say it out loud. */}
      <Pressable
        style={[styles.noteBtn, noteState === "recording" && styles.noteBtnLive]}
        onPress={toggleNote}
        disabled={noteState === "sending"}
        testID="quick-voice-note"
        accessibilityRole="button"
        accessibilityLabel={
          noteState === "recording" ? "Stop recording and send this voice note"
            : `Record a voice note for ${firstName}`
        }
        accessibilityHint="Tap once to start, tap again to send"
      >
        <GradientFill tone={noteState === "recording" ? "danger" : "brand"} radius={999} />
        {noteState === "sending"
          ? <ActivityIndicator color="#fff" />
          : <Ionicons name={noteState === "recording" ? "stop" : noteState === "sent" ? "checkmark-circle" : "mic"} size={26} color="#fff" />}
        <AppText style={styles.noteBtnText}>
          {noteState === "recording" ? "Tap to send"
            : noteState === "sending" ? "Sending…"
              : noteState === "sent" ? "Voice note sent"
                : "Send a voice note"}
        </AppText>
      </Pressable>
      {noteError && <AppText style={styles.error} testID="quick-note-error">{noteError}</AppText>}

      {/* The thread, so a reply has somewhere to land. */}
      {messages.length > 0 && (
        <View style={styles.thread} testID="quick-thread">
          {messages.length > shown.length && (
            <Pressable onPress={() => setShowAll(true)} testID="quick-show-all"
              accessibilityRole="button" accessibilityLabel="Show earlier messages">
              <AppText style={styles.showAll}>Show earlier messages</AppText>
            </Pressable>
          )}
          {shown.map((m) => (
            <View
              key={m.id}
              style={[styles.bubble, m.mine ? styles.mine : styles.theirs]}
              testID={`msg-${m.id}`}
              accessibilityLabel={`${m.mine ? "You said" : firstName + " said"}: ${m.text}`}
            >
              <AppText style={[styles.bubbleText, m.mine && styles.bubbleTextMine]}>{m.text}</AppText>
            </View>
          ))}
        </View>
      )}

      {/* Anything the templates don't cover. */}
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Or write your own…"
          placeholderTextColor={theme.colors.muted}
          value={typed}
          onChangeText={setTyped}
          multiline
          testID="quick-input"
          accessibilityLabel={`Write a message to ${firstName}`}
        />
        <Pressable
          style={[styles.sendBtn, !typed.trim() && styles.sendBtnOff]}
          onPress={() => send(undefined, typed.trim())}
          disabled={!typed.trim() || sendingId !== null}
          testID="quick-send"
          accessibilityRole="button"
          accessibilityLabel="Send this message"
        >
          <Ionicons name="arrow-up" size={22} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  loading: { paddingVertical: 28, alignItems: "center" },
  section: { fontSize: 22, fontWeight: "800", color: theme.colors.onSurface },
  groupLabel: {
    fontSize: theme.font.xs, fontWeight: "800", color: theme.colors.muted,
    textTransform: "uppercase", letterSpacing: 0.6,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 8, minHeight: 52, flexShrink: 1,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1.5, borderColor: theme.colors.border,
  },
  chipText: { fontSize: theme.font.base, fontWeight: "700", color: theme.colors.onSurface, flexShrink: 1 },
  noteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    minHeight: 60, borderRadius: 999, overflow: "hidden", marginTop: 4,
  },
  noteBtnLive: { transform: [{ scale: 1.01 }] },
  noteBtnText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  error: { fontSize: theme.font.sm, color: theme.colors.error, lineHeight: 20 },
  thread: { gap: 8, marginTop: 6 },
  showAll: { fontSize: theme.font.sm, fontWeight: "700", color: theme.colors.brand, paddingVertical: 8 },
  bubble: { maxWidth: "86%", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  mine: {
    alignSelf: "flex-end", backgroundColor: theme.colors.brand,
    borderBottomRightRadius: 6,
  },
  theirs: {
    alignSelf: "flex-start", backgroundColor: theme.colors.surfaceSecondary,
    borderBottomLeftRadius: 6, borderWidth: 1, borderColor: theme.colors.border,
  },
  bubbleText: { fontSize: theme.font.base, color: theme.colors.onSurface, lineHeight: 23 },
  bubbleTextMine: { color: "#fff", fontWeight: "600" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 4 },
  input: {
    flex: 1, minHeight: 52, maxHeight: 120, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 14,
    backgroundColor: theme.colors.surfaceSecondary, borderWidth: 1.5, borderColor: theme.colors.border,
    fontSize: theme.font.base, color: theme.colors.onSurface,
  },
  sendBtn: {
    width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.brand,
  },
  sendBtnOff: { backgroundColor: theme.colors.borderStrong },
});
