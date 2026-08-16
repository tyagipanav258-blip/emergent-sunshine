import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { storage } from "@/src/utils/storage";
import { theme, API } from "@/src/theme";

const SESSION_KEY = "sunshine_assistant_session";

type Msg = { role: "user" | "assistant"; text: string };

const SUGGESTIONS = [
  "Suggest a light dinner",
  "How do I stay safe from scams?",
  "A gentle exercise for my knees",
  "Help me video call my daughter",
];

export default function AssistantScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Msg>>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    (async () => {
      const sid = await storage.getItem<string>(SESSION_KEY, "");
      if (sid) {
        setSessionId(sid);
        try {
          const res = await fetch(`${API}/assistant/history?session_id=${sid}`);
          if (res.ok) {
            const data = await res.json();
            setMessages(data.map((m: any) => ({ role: m.role, text: m.text })));
          }
        } catch {}
      }
      setLoadingHistory(false);
    })();
  }, []);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const msg = text.trim();
      if (!msg || sending) return;
      if (Platform.OS !== "web") Haptics.selectionAsync();
      setInput("");
      setMessages((prev) => [...prev, { role: "user", text: msg }]);
      setSending(true);
      scrollToEnd();
      try {
        const res = await fetch(`${API}/assistant/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, message: msg }),
        });
        const data = await res.json();
        if (!sessionId && data.session_id) {
          setSessionId(data.session_id);
          await storage.setItem(SESSION_KEY, data.session_id);
        }
        setMessages((prev) => [...prev, { role: "assistant", text: data.answer || "Sorry, I couldn't answer that." }]);
      } catch {
        setMessages((prev) => [...prev, { role: "assistant", text: "Sorry, I'm having trouble right now. Please try again in a moment." }]);
      } finally {
        setSending(false);
        scrollToEnd();
      }
    },
    [sending, sessionId, scrollToEnd]
  );

  const startNewChat = useCallback(async () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setMessages([]);
    setSessionId(null);
    await storage.removeItem(SESSION_KEY);
  }, []);

  const showEmpty = !loadingHistory && messages.length === 0;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBtn} testID="assistant-back">
          <Ionicons name="chevron-down" size={28} color={theme.colors.onSurface} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.headerSun}>
            <Ionicons name="sunny" size={22} color="#fff" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Ask Sunshine</Text>
            <Text style={styles.headerSub}>Your friendly helper</Text>
          </View>
        </View>
        <Pressable onPress={startNewChat} hitSlop={12} style={styles.headerBtn} testID="assistant-new-chat">
          <Ionicons name="create-outline" size={26} color={theme.colors.brand} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "translate-with-padding"}
        keyboardVerticalOffset={0}
      >
        {loadingHistory ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.colors.brand} />
          </View>
        ) : showEmpty ? (
          <ScrollView contentContainerStyle={styles.emptyWrap} keyboardShouldPersistTaps="handled">
            <View style={styles.bigSun}>
              <Ionicons name="sunny" size={54} color="#fff" />
            </View>
            <Text style={styles.emptyTitle}>Hello, Kamala!</Text>
            <Text style={styles.emptyText}>
              Ask me anything. I can help with recipes, health tips, staying safe, or using your phone.
            </Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} style={styles.suggestionCard} onPress={() => send(s)} testID={`assistant-suggestion-${s}`}>
                  <Ionicons name="chatbubble-ellipses-outline" size={22} color={theme.colors.brand} />
                  <Text style={styles.suggestionText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={scrollToEnd}
            renderItem={({ item }) => <Bubble msg={item} />}
            ListFooterComponent={
              sending ? (
                <View style={[styles.bubble, styles.bubbleAssistant, styles.typing]}>
                  <ActivityIndicator size="small" color={theme.colors.brand} />
                  <Text style={styles.typingText}>Sunshine is typing...</Text>
                </View>
              ) : null
            }
          />
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }]}>
          <TextInput
            style={styles.input}
            placeholder="Type your message..."
            placeholderTextColor={theme.colors.muted}
            value={input}
            onChangeText={setInput}
            multiline
            testID="assistant-input"
          />
          <Pressable
            style={[styles.sendBtn, (!input.trim() || sending) && { opacity: 0.5 }]}
            onPress={() => send(input)}
            disabled={!input.trim() || sending}
            testID="assistant-send"
          >
            <Ionicons name="arrow-up" size={26} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  return (
    <View style={[styles.bubbleRow, isUser ? styles.rowRight : styles.rowLeft]}>
      {!isUser && (
        <View style={styles.avatarSun}>
          <Ionicons name="sunny" size={16} color="#fff" />
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.bubbleText, isUser && { color: "#fff" }]}>{msg.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerSun: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: theme.colors.onSurface },
  headerSub: { fontSize: 13, color: theme.colors.muted },

  listContent: { padding: 16, gap: 12, paddingBottom: 20 },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "100%" },
  rowLeft: { justifyContent: "flex-start" },
  rowRight: { justifyContent: "flex-end" },
  avatarSun: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: theme.colors.brand,
    alignItems: "center", justifyContent: "center",
    marginBottom: 2,
  },
  bubble: {
    maxWidth: "82%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
  },
  bubbleUser: {
    backgroundColor: theme.colors.brand,
    borderBottomRightRadius: 6,
  },
  bubbleAssistant: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderBottomLeftRadius: 6,
  },
  bubbleText: { fontSize: 18, lineHeight: 25, color: theme.colors.onSurface },
  typing: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "flex-start", marginLeft: 38 },
  typingText: { fontSize: 15, color: theme.colors.muted, fontWeight: "600" },

  emptyWrap: { alignItems: "center", padding: 24, paddingTop: 40, gap: 12 },
  bigSun: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: theme.colors.brand,
    alignItems: "center", justifyContent: "center",
    shadowColor: theme.colors.brand,
    shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  emptyTitle: { fontSize: 26, fontWeight: "800", color: theme.colors.onSurface, marginTop: 8 },
  emptyText: { fontSize: 17, lineHeight: 24, color: theme.colors.onSurfaceSecondary, textAlign: "center", paddingHorizontal: 12 },
  suggestions: { alignSelf: "stretch", gap: 12, marginTop: 16 },
  suggestionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 18,
    padding: 18,
  },
  suggestionText: { fontSize: 17, fontWeight: "600", color: theme.colors.onSurface, flex: 1 },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  input: {
    flex: 1,
    fontSize: 18,
    color: theme.colors.onSurface,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 52,
    maxHeight: 120,
  },
  sendBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: theme.colors.brand,
    alignItems: "center", justifyContent: "center",
  },
});
