import { View, StyleSheet, FlatList, Pressable, ActivityIndicator } from "react-native";
import { AppText } from "@/src/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNotifications, NOTIFICATION_STYLE, Notification } from "@/src/hooks/use-notifications";
import { theme } from "@/src/theme";

function whenText(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  if (diff < 172800) return "Yesterday";
  return `${Math.floor(diff / 86400)} days ago`;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { items, unread, loading, markRead, markAllRead } = useNotifications();

  const open = (n: Notification) => {
    if (!n.read) markRead(n.id);
    if (n.kind === "invoice" || n.kind === "task_assigned" || n.kind === "task_update") {
      router.push("/(child)/tasks");
    }
  };

  return (
    <View style={styles.root} testID="notifications-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.hBtn} testID="notifications-back"
          accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-down" size={28} color={theme.colors.onSurface} />
        </Pressable>
        <AppText style={styles.hTitle}>Updates</AppText>
        {unread > 0 ? (
          <Pressable onPress={markAllRead} hitSlop={12} style={styles.readAll} testID="mark-all-read"
            accessibilityRole="button" accessibilityLabel="Mark everything as read">
            <AppText style={styles.readAllText}>Mark all read</AppText>
          </Pressable>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.brand} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-outline" size={48} color={theme.colors.muted} />
          <AppText style={styles.empty}>Nothing new yet. Updates from your family will show up here.</AppText>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: insets.bottom + 32 }}
          renderItem={({ item }) => {
            const style = NOTIFICATION_STYLE[item.kind] || { icon: "information-circle", tone: "neutral" };
            const tint = style.tone === "urgent" ? theme.colors.error
              : style.tone === "warm" ? theme.colors.marigoldDark
                : theme.colors.brand;
            return (
              <Pressable
                style={[styles.row, !item.read && styles.rowUnread]}
                onPress={() => open(item)}
                testID={`notification-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${item.title || "Update"}. ${item.message}. ${whenText(item.at)}${item.read ? "" : ". Not read yet"}`}
              >
                <View style={[styles.icon, { backgroundColor: tint + "22" }]}>
                  <Ionicons name={style.icon} size={22} color={tint} />
                </View>
                <View style={{ flex: 1 }}>
                  {item.title ? <AppText style={styles.title}>{item.title}</AppText> : null}
                  <AppText style={styles.message}>{item.message}</AppText>
                  <AppText style={styles.when}>{whenText(item.at)}</AppText>
                </View>
                {!item.read && <View style={styles.dot} />}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  hBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  hTitle: { fontSize: theme.font.lg, fontWeight: "800", color: theme.colors.onSurface },
  readAll: { minHeight: 44, justifyContent: "center" },
  readAllText: { fontSize: theme.font.sm, fontWeight: "700", color: theme.colors.brand },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  empty: { fontSize: theme.font.base, color: theme.colors.muted, textAlign: "center", lineHeight: 24 },
  row: {
    flexDirection: "row", alignItems: "flex-start", gap: 14, padding: 16, minHeight: 84,
    backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  rowUnread: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brandLight },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  title: { fontSize: theme.font.base, fontWeight: "800", color: theme.colors.onSurface },
  message: { fontSize: theme.font.sm, color: theme.colors.onSurfaceSecondary, lineHeight: 21, marginTop: 2 },
  when: { fontSize: theme.font.xs, color: theme.colors.muted, marginTop: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.brand, marginTop: 6 },
});
