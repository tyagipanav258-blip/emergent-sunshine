import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetch, logActivity } from "@/src/api";
import { LogoMark } from "@/src/components/Logo";
import { theme } from "@/src/theme";

type News = { id: string; title: string; summary: string; source: string; image: string; time: string };
type Story = { id: string; name: string; relation: string; avatar: string; kind: string; preview: string; unseen: boolean };

export default function ElderHome() {
  const insets = useSafeAreaInsets();
  const [stories, setStories] = useState<Story[]>([]);
  const [news, setNews] = useState<News[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeStory, setActiveStory] = useState<Story | null>(null);

  useEffect(() => {
    logActivity("News");
    (async () => {
      try {
        const [s, n] = await Promise.all([
          apiFetch<Story[]>("/family-stories"),
          apiFetch<{ items: News[]; next_page: number }>("/news?page=0"),
        ]);
        setStories(s);
        setNews(n.items);
        setPage(1);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const n = await apiFetch<{ items: News[]; next_page: number }>(`/news?page=${page}`);
      setNews((prev) => [...prev, ...n.items]);
      setPage((p) => p + 1);
    } catch {}
    setLoadingMore(false);
  }, [page, loadingMore]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="elder-home">
      <View style={styles.header}>
        <LogoMark size={40} />
        <Text style={styles.headerTitle}>Good day!</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.brand} /></View>
      ) : (
        <FlatList
          data={news}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingBottom: 180 }}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          ListHeaderComponent={
            <View>
              <Text style={styles.section}>Family Updates</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storiesRow}>
                {stories.map((s) => (
                  <Pressable key={s.id} style={styles.story} onPress={() => setActiveStory(s)} testID={`story-${s.id}`}>
                    <View style={[styles.ring, s.unseen && { borderColor: theme.colors.marigold }]}>
                      <Image source={{ uri: s.avatar }} style={styles.avatar} />
                      {s.kind === "voice" && <View style={styles.badge}><Ionicons name="mic" size={12} color="#fff" /></View>}
                      {s.kind === "album" && <View style={styles.badge}><Ionicons name="images" size={12} color="#fff" /></View>}
                    </View>
                    <Text style={styles.storyName} numberOfLines={1}>{s.name}</Text>
                    <Text style={styles.storyRel} numberOfLines={1}>{s.relation}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={[styles.section, { marginTop: 20 }]}>Today&apos;s News</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card} testID={`news-${item.id}`}>
              <Image source={{ uri: item.image }} style={styles.cardImage} contentFit="cover" />
              <View style={styles.cardBody}>
                <View style={styles.cardMeta}>
                  <Text style={styles.source}>{item.source}</Text>
                  <Text style={styles.time}>{item.time}</Text>
                </View>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.summary}>{item.summary}</Text>
              </View>
            </View>
          )}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.colors.brand} style={{ marginVertical: 20 }} /> : <View style={{ height: 20 }} />}
        />
      )}

      {activeStory && (
        <View style={styles.storyModal} testID="story-modal">
          <Image source={{ uri: activeStory.avatar }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={styles.storyOverlay} />
          <View style={[styles.storyHeader, { paddingTop: insets.top + 12 }]}>
            <Image source={{ uri: activeStory.avatar }} style={styles.storyHeadAvatar} />
            <Text style={styles.storyHeadName}>{activeStory.name}</Text>
            <Pressable onPress={() => setActiveStory(null)} hitSlop={12} testID="story-close"><Ionicons name="close" size={32} color="#fff" /></Pressable>
          </View>
          <View style={styles.storyBody}><Text style={styles.storyText}>{activeStory.preview}</Text></View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  headerTitle: { fontSize: 24, fontWeight: "800", color: theme.colors.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  section: { fontSize: 22, fontWeight: "800", color: theme.colors.onSurface, paddingHorizontal: 20, marginBottom: 12 },
  storiesRow: { paddingHorizontal: 16, gap: 14 },
  story: { alignItems: "center", width: 82 },
  ring: { width: 78, height: 78, borderRadius: 39, borderWidth: 3, borderColor: theme.colors.borderStrong, alignItems: "center", justifyContent: "center", padding: 2 },
  avatar: { width: 68, height: 68, borderRadius: 34 },
  badge: { position: "absolute", bottom: -2, right: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.colors.surface },
  storyName: { marginTop: 8, fontSize: 15, fontWeight: "700", color: theme.colors.onSurface },
  storyRel: { fontSize: 12, color: theme.colors.muted },
  card: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: 24, overflow: "hidden", marginHorizontal: 20, marginBottom: 16, borderWidth: 1, borderColor: theme.colors.border },
  cardImage: { width: "100%", height: 200 },
  cardBody: { padding: 16, gap: 8 },
  cardMeta: { flexDirection: "row", justifyContent: "space-between" },
  source: { fontSize: 14, color: theme.colors.brand, fontWeight: "700" },
  time: { fontSize: 14, color: theme.colors.muted },
  title: { fontSize: 21, fontWeight: "800", color: theme.colors.onSurface, lineHeight: 27 },
  summary: { fontSize: 17, color: theme.colors.onSurfaceSecondary, lineHeight: 24 },
  storyModal: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
  storyOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  storyHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20 },
  storyHeadAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: "#fff" },
  storyHeadName: { flex: 1, color: "#fff", fontSize: 18, fontWeight: "800" },
  storyBody: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  storyText: { color: "#fff", fontSize: 26, fontWeight: "700", textAlign: "center", lineHeight: 36 },
});
