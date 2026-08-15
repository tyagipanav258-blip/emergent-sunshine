import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme, API } from "@/src/theme";

const NEWS_CATS = ["All", "Local", "India", "World", "Community", "Weather"];

type Story = { id: string; name: string; relation: string; avatar: string; kind: string; preview: string; time: string; unseen: boolean };
type News = { id: string; title: string; summary: string; source: string; category: string; image: string; time: string; saved: boolean };

export default function NewsScreen() {
  const insets = useSafeAreaInsets();
  const [stories, setStories] = useState<Story[]>([]);
  const [news, setNews] = useState<News[]>([]);
  const [cat, setCat] = useState("All");
  const [loading, setLoading] = useState(true);
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (c: string) => {
    try {
      const [s, n] = await Promise.all([
        fetch(`${API}/family-stories`).then((r) => r.json()),
        fetch(c === "All" ? `${API}/news` : `${API}/news?category=${c}`).then((r) => r.json()),
      ]);
      setStories(s);
      setNews(n);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load(cat);
  }, [cat, load]);

  const toggleSave = async (id: string) => {
    setNews((prev) => prev.map((n) => (n.id === id ? { ...n, saved: !n.saved } : n)));
    try { await fetch(`${API}/news/${id}/save`, { method: "POST" }); } catch {}
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="news-screen">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Sunshine</Text>
        <Ionicons name="sunny" size={26} color={theme.colors.brand} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={theme.colors.brand} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(cat); }} tintColor={theme.colors.brand} />}
        >
          {/* Family Updates */}
          <Text style={styles.sectionTitle}>Family Updates</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.storiesRow}
          >
            {stories.map((s) => (
              <Pressable key={s.id} onPress={() => setActiveStory(s)} style={styles.storyItem} testID={`story-${s.id}`}>
                <View style={[styles.storyRing, s.unseen && { borderColor: theme.colors.brand }]}>
                  <Image source={{ uri: s.avatar }} style={styles.storyAvatar} />
                  {s.kind === "voice" && (
                    <View style={styles.storyBadge}>
                      <Ionicons name="mic" size={12} color="#fff" />
                    </View>
                  )}
                  {s.kind === "album" && (
                    <View style={styles.storyBadge}>
                      <Ionicons name="images" size={12} color="#fff" />
                    </View>
                  )}
                </View>
                <Text style={styles.storyName} numberOfLines={1}>{s.name}</Text>
                <Text style={styles.storyRel} numberOfLines={1}>{s.relation}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* News */}
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Today&apos;s News</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.newsCatsRow}
          >
            {NEWS_CATS.map((c) => {
              const active = c === cat;
              return (
                <Pressable
                  key={c}
                  onPress={() => setCat(c)}
                  style={[styles.newsCat, active && styles.newsCatActive]}
                  testID={`news-cat-${c.toLowerCase()}`}
                >
                  <Text style={[styles.newsCatText, active && styles.newsCatTextActive]}>{c}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={{ gap: 16, paddingHorizontal: 16, marginTop: 8 }}>
            {news.map((n) => (
              <View key={n.id} style={styles.newsCard} testID={`news-${n.id}`}>
                <Image source={{ uri: n.image }} style={styles.newsImage} />
                <View style={styles.newsBody}>
                  <View style={styles.newsMeta}>
                    <Text style={styles.newsCatPill}>{n.category}</Text>
                    <Text style={styles.newsTime}>{n.time}</Text>
                  </View>
                  <Text style={styles.newsTitle}>{n.title}</Text>
                  <Text style={styles.newsSummary} numberOfLines={3}>{n.summary}</Text>
                  <View style={styles.newsFooter}>
                    <Text style={styles.newsSource}>{n.source}</Text>
                    <Pressable
                      onPress={() => toggleSave(n.id)}
                      style={styles.saveBtn}
                      hitSlop={8}
                      testID={`news-save-${n.id}`}
                    >
                      <Ionicons
                        name={n.saved ? "bookmark" : "bookmark-outline"}
                        size={22}
                        color={n.saved ? theme.colors.brand : theme.colors.onSurface}
                      />
                      <Text style={styles.saveBtnText}>{n.saved ? "Saved" : "Save"}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {activeStory && (
        <StoryModal story={activeStory} onClose={() => setActiveStory(null)} />
      )}
    </View>
  );
}

function StoryModal({ story, onClose }: { story: Story; onClose: () => void }) {
  return (
    <View style={styles.storyModal} testID="story-modal">
      <Image source={{ uri: story.avatar }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={styles.storyOverlay} />
      <View style={styles.storyModalHeader}>
        <Image source={{ uri: story.avatar }} style={styles.storyModalAvatar} />
        <View style={{ flex: 1 }}>
          <Text style={styles.storyModalName}>{story.name}</Text>
          <Text style={styles.storyModalTime}>{story.time}</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12} testID="story-close">
          <Ionicons name="close" size={32} color="#fff" />
        </Pressable>
      </View>
      <View style={styles.storyModalBody}>
        <Text style={styles.storyModalText}>{story.preview}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 },
  headerTitle: { fontSize: 28, fontWeight: "800", color: theme.colors.onSurface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 22, fontWeight: "800", color: theme.colors.onSurface, paddingHorizontal: 20, marginBottom: 12 },
  storiesRow: { paddingHorizontal: 16, gap: 14 },
  storyItem: { alignItems: "center", width: 82 },
  storyRing: {
    width: 78, height: 78, borderRadius: 39,
    borderWidth: 3, borderColor: theme.colors.borderStrong,
    alignItems: "center", justifyContent: "center",
    padding: 2,
    position: "relative",
  },
  storyAvatar: { width: 68, height: 68, borderRadius: 34 },
  storyBadge: {
    position: "absolute",
    bottom: -2, right: -2,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: theme.colors.brand,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: theme.colors.surface,
  },
  storyName: { marginTop: 8, fontSize: 15, fontWeight: "700", color: theme.colors.onSurface },
  storyRel: { fontSize: 12, color: theme.colors.muted },

  newsCatsRow: { paddingHorizontal: 16, gap: 10, paddingBottom: 8 },
  newsCat: {
    paddingHorizontal: 18, height: 40, borderRadius: 999,
    borderWidth: 1.5, borderColor: theme.colors.borderStrong,
    justifyContent: "center", flexShrink: 0,
    backgroundColor: theme.colors.surface,
  },
  newsCatActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  newsCatText: { fontSize: 15, fontWeight: "600", color: theme.colors.onSurface },
  newsCatTextActive: { color: "#fff", fontWeight: "800" },

  newsCard: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 24,
    overflow: "hidden",
  },
  newsImage: { width: "100%", height: 200 },
  newsBody: { padding: 16, gap: 8 },
  newsMeta: { flexDirection: "row", alignItems: "center", gap: 10 },
  newsCatPill: {
    backgroundColor: theme.colors.brandLight,
    color: theme.colors.onBrandLight,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
    fontSize: 13, fontWeight: "700",
    overflow: "hidden",
  },
  newsTime: { fontSize: 14, color: theme.colors.muted },
  newsTitle: { fontSize: 20, fontWeight: "800", color: theme.colors.onSurface, lineHeight: 26 },
  newsSummary: { fontSize: 16, color: theme.colors.onSurfaceSecondary, lineHeight: 22 },
  newsFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  newsSource: { fontSize: 14, color: theme.colors.muted, fontWeight: "600" },
  saveBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 10 },
  saveBtnText: { fontSize: 15, fontWeight: "700", color: theme.colors.onSurface },

  storyModal: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
  storyOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  storyModalHeader: { flexDirection: "row", alignItems: "center", padding: 20, paddingTop: 60, gap: 12 },
  storyModalAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: "#fff" },
  storyModalName: { color: "#fff", fontSize: 18, fontWeight: "800" },
  storyModalTime: { color: "rgba(255,255,255,0.85)", fontSize: 14 },
  storyModalBody: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  storyModalText: { color: "#fff", fontSize: 26, fontWeight: "700", textAlign: "center", lineHeight: 36 },
});
