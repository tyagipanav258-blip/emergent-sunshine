import { useState } from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { AppText } from "@/src/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { apiFetch } from "@/src/api";
import { theme } from "@/src/theme";

export type Reactable = {
  id: string;
  reactions?: Record<string, number>;
  my_reaction?: string | null;
};

/** Five large targets, not a keyboard of emoji. */
const CHOICES: { id: string; icon: any; label: string; tint: string }[] = [
  { id: "heart", icon: "heart", label: "Love this", tint: "#C2565B" },
  { id: "thumbs-up", icon: "thumbs-up", label: "Like this", tint: "#3D7EA6" },
  { id: "happy", icon: "happy", label: "Made me smile", tint: "#E0A100" },
  { id: "pray", icon: "flower", label: "Blessings", tint: "#7A6CB0" },
  { id: "laugh", icon: "sunny", label: "Made me laugh", tint: "#D07C36" },
];

/**
 * Reacting to a shared photo.
 *
 * The same row serves both apps, so a grandchild's picture can be answered in
 * one tap from either side. Tapping your own reaction again takes it back, and
 * only one per person counts — so the row stays a readable set of numbers rather
 * than a pile, and the sharer is told once, not on every tap.
 */
export function PhotoReactions({
  photo, onChange, compact = false,
}: { photo: Reactable; onChange?: (next: Reactable) => void; compact?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [local, setLocal] = useState<Reactable>(photo);
  const state = local.id === photo.id ? local : photo;
  const counts = state.reactions || {};
  const mine = state.my_reaction || null;

  const react = async (emoji: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(emoji);
    // Move the number before the round trip; reacting should feel instant.
    const taking = mine === emoji;
    const optimistic: Reactable = {
      ...state,
      my_reaction: taking ? null : emoji,
      reactions: (() => {
        const next = { ...counts };
        if (mine) next[mine] = Math.max((next[mine] || 1) - 1, 0);
        if (!taking) next[emoji] = (next[emoji] || 0) + 1;
        Object.keys(next).forEach((k) => { if (!next[k]) delete next[k]; });
        return next;
      })(),
    };
    setLocal(optimistic);
    onChange?.(optimistic);
    try {
      const saved = await apiFetch<Reactable>(`/family/photos/${photo.id}/react`, {
        method: "POST", body: { emoji },
      });
      setLocal(saved);
      onChange?.(saved);
    } catch {
      setLocal(state);
      onChange?.(state);
    }
    setBusy(null);
  };

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  // On a tile, only what has actually been reacted — the picker belongs in the viewer.
  if (compact) {
    if (!total) return null;
    return (
      <View style={styles.compact} testID={`reactions-${photo.id}`}>
        {CHOICES.filter((c) => counts[c.id]).map((c) => (
          <View key={c.id} style={styles.compactPill}>
            <Ionicons name={c.icon} size={12} color={c.tint} />
            <AppText style={styles.compactCount}>{counts[c.id]}</AppText>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.row} testID={`react-row-${photo.id}`}>
      {CHOICES.map((c) => {
        const on = mine === c.id;
        const n = counts[c.id] || 0;
        return (
          <Pressable
            key={c.id}
            style={[styles.btn, on && { borderColor: c.tint, backgroundColor: c.tint + "1A" }]}
            onPress={() => react(c.id)}
            disabled={busy !== null}
            testID={`react-${c.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={on ? `Take back ${c.label.toLowerCase()}` : c.label}
          >
            <Ionicons name={c.icon} size={22} color={on ? c.tint : theme.colors.muted} />
            {n > 0 && (
              <AppText style={[styles.count, on && { color: c.tint }]}>{n}</AppText>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  btn: {
    flexDirection: "row", alignItems: "center", gap: 6, minHeight: 48, minWidth: 56,
    paddingHorizontal: 14, borderRadius: 999, justifyContent: "center",
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1.5, borderColor: theme.colors.border,
  },
  count: { fontSize: theme.font.sm, fontWeight: "800", color: theme.colors.onSurfaceSecondary },
  compact: { flexDirection: "row", gap: 4, position: "absolute", top: 6, left: 6 },
  compactPill: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(255,255,255,0.94)", borderRadius: 999,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  compactCount: { fontSize: 11, fontWeight: "800", color: theme.colors.onSurface },
});
