import { View, StyleSheet, Pressable } from "react-native";
import { AppText } from "@/src/components/AppText";
import { PhotoReactions, Reactable } from "@/src/components/PhotoReactions";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "@/src/theme";

/** A small sheet around the same five-choice reaction row photos use, so a
 * video can be answered the same warm way — "made me smile", "blessings" —
 * rather than only a like. */
export function ReactionSheet({
  item, title, endpoint, onChange, onClose,
}: {
  item: Reactable;
  title: string;
  endpoint: (id: string) => string;
  onChange: (next: Reactable) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.backdrop} testID={`reaction-sheet-${item.id}`}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.handle} />
        <AppText style={styles.title} numberOfLines={1}>How did this make you feel? · {title}</AppText>
        <PhotoReactions photo={item} endpoint={endpoint} onChange={(next) => { onChange(next); onClose(); }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 20, gap: 14 },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: theme.colors.borderStrong, alignSelf: "center" },
  title: { fontSize: 17, fontWeight: "800", color: theme.colors.onSurface },
});
