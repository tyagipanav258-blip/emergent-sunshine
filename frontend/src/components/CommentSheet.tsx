import { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, TextInput, ScrollView, ActivityIndicator, Platform, KeyboardAvoidingView } from "react-native";
import { AppText } from "@/src/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetch } from "@/src/api";
import { theme } from "@/src/theme";

type Comment = { id: string; name: string; role: "elder" | "child"; text: string; created_at: string };

/**
 * Talking about a shared video, from either side. Same list, same endpoint,
 * whichever app opens it — the elder sees her family's reply, and a family
 * member sees what she said back.
 */
export function CommentSheet({
  contentId, title, onClose, onCountChange,
}: { contentId: string; title: string; onClose: () => void; onCountChange?: (count: number) => void }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    apiFetch<Comment[]>(`/content/${contentId}/comments`)
      .then(setComments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [contentId]);

  const send = async () => {
    const value = text.trim();
    if (!value || sending) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSending(true);
    try {
      const saved = await apiFetch<Comment>(`/content/${contentId}/comments`, { method: "POST", body: { text: value } });
      const next = [...comments, saved];
      setComments(next);
      onCountChange?.(next.length);
      setText("");
    } catch {}
    setSending(false);
  };

  return (
    <View style={styles.backdrop} testID={`comments-${contentId}`}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <AppText style={styles.title} numberOfLines={1}>Comments · {title}</AppText>
            <Pressable onPress={onClose} hitSlop={10} testID="comments-close" accessibilityRole="button" accessibilityLabel="Close comments">
              <Ionicons name="close" size={26} color={theme.colors.muted} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={theme.colors.brand} style={{ marginVertical: 24 }} />
          ) : comments.length === 0 ? (
            <AppText style={styles.empty}>No comments yet. Say something nice.</AppText>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
              {comments.map((c) => (
                <View key={c.id} style={styles.row} testID={`comment-${c.id}`}>
                  <View style={[styles.avatar, c.role === "elder" && styles.avatarElder]}>
                    <Ionicons name={c.role === "elder" ? "happy" : "person"} size={18} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText style={styles.name}>{c.name}</AppText>
                    <AppText style={styles.text}>{c.text}</AppText>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Add a comment..."
              placeholderTextColor={theme.colors.muted}
              value={text}
              onChangeText={setText}
              multiline
              testID="comment-input"
            />
            <Pressable
              style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
              onPress={send}
              disabled={!text.trim() || sending}
              testID="comment-send"
              accessibilityRole="button"
              accessibilityLabel="Post comment"
            >
              <Ionicons name="send" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheetWrap: { maxHeight: "78%" },
  sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 20, gap: 14 },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: theme.colors.borderStrong, alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  title: { flex: 1, fontSize: 18, fontWeight: "800", color: theme.colors.onSurface },
  empty: { fontSize: 15, color: theme.colors.muted, textAlign: "center", paddingVertical: 20 },
  list: { maxHeight: 320 },
  row: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatarElder: { backgroundColor: theme.colors.marigoldDark },
  name: { fontSize: 14, fontWeight: "800", color: theme.colors.onSurface },
  text: { fontSize: 15, color: theme.colors.onSurfaceSecondary, marginTop: 1, lineHeight: 20 },
  inputRow: { flexDirection: "row", gap: 10, alignItems: "flex-end", marginTop: 4 },
  input: {
    flex: 1, minHeight: 44, maxHeight: 100, borderRadius: 18, borderWidth: 1.5, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSecondary, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, color: theme.colors.onSurface,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center" },
});
