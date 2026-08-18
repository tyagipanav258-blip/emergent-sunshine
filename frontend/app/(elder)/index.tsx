import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { AppText } from "@/src/components/AppText";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetch, logActivity } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useNotifications } from "@/src/hooks/use-notifications";
import { LogoMark } from "@/src/components/Logo";
import { PageHeader, ScreenGradient } from "@/src/components/ui";
import { useScrollChrome } from "@/src/scroll-context";
import { theme } from "@/src/theme";

type News = { id: string; title: string; summary: string; source: string; image: string };
type FamilyMember = { id: string; name: string; relation: string; photo_url?: string | null };

export default function ElderHome() {
  const insets = useSafeAreaInsets();
  const { onScroll } = useScrollChrome();
  const router = useRouter();
  const { user } = useAuth();
  const { unread } = useNotifications();
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [news, setNews] = useState<News[]>([]);
  const [page, setPage] = useState<number | null>(0);
  const [greeting, setGreeting] = useState("Hello");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    logActivity("News");
    (async () => {
      try {
        const [f, n, h] = await Promise.all([
          apiFetch<{ members: FamilyMember[] }>("/family").catch(() => ({ members: [] })),
          apiFetch<{ items: News[]; next_page: number | null }>("/news?page=0"),
          apiFetch<{ greeting: string }>("/health/overview").catch(() => ({ greeting: "Hello" })),
        ]);
        setFamily(f.members || []);
        setNews(n.items);
        setPage(n.next_page);
        setGreeting(h.greeting || "Hello");
      } catch {}
      setLoading(false);
    })();
  }, []);

  const loadMore = useCallback(async () => {
    // `page` is null once the digest is exhausted, so the feed ends instead of looping.
    if (loadingMore || page === null) return;
    setLoadingMore(true);
    try {
      const n = await apiFetch<{ items: News[]; next_page: number | null }>(`/news?page=${page}`);
      setNews((prev) => [...prev, ...n.items]);
      setPage(n.next_page);
    } catch {}
    setLoadingMore(false);
  }, [page, loadingMore]);

  const firstName = user?.name?.split(" ")[0] || "";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="elder-home">
      <ScreenGradient height={300} />
      <PageHeader
        title={`${greeting}${firstName ? `, ${firstName}` : ""}`}
        subtitle={user?.location || "Here's your day"}
        avatar={<LogoMark size={44} />}
        icon="notifications-outline"
        iconBadge={unread}
        iconLabel={unread > 0 ? `Updates, ${unread} new` : "Updates"}
        onIconPress={() => router.push("/notifications")}
        testID="elder-home-header"
      />

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.brand} /></View>
      ) : (
        <FlatList
          data={news}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingBottom: theme.fabClearance }}
          onScroll={onScroll}
          scrollEventThrottle={32}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          ListHeaderComponent={
            <View>
              <AppText style={styles.section}>Your family</AppText>
              {family.length === 0 ? (
                <Pressable
                  style={styles.inviteCard}
                  onPress={() => router.push("/(elder)/profile")}
                  testID="family-invite"
                  accessibilityRole="button"
                  accessibilityLabel="Invite your family"
                  accessibilityHint="Opens your profile where you can share your family code"
                >
                  <View style={styles.inviteIcon}>
                    <Ionicons name="person-add" size={26} color={theme.colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText style={styles.inviteTitle}>Invite your family</AppText>
                    <AppText style={styles.inviteSub}>
                      Share your family code so they can check in on you and help arrange things.
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={24} color={theme.colors.brand} />
                </Pressable>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storiesRow}>
                  {family.map((f) => (
                    <Pressable
                      key={f.id}
                      style={styles.story}
                      onPress={() => router.push({ pathname: "/family/[id]", params: { id: f.id, name: f.name } })}
                      testID={`family-${f.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${f.name}, your ${f.relation.toLowerCase()}. Send them a message, a voice note or a photo.`}
                    >
                      <View style={styles.ring}>
                        <View style={styles.avatar}>
                          {f.photo_url ? (
                            <Image source={{ uri: f.photo_url }} style={styles.avatarImg} contentFit="cover" />
                          ) : (
                            <Ionicons name="person" size={30} color={theme.colors.brand} />
                          )}
                        </View>
                        <View style={styles.ringBadge}><Ionicons name="chatbubble" size={12} color="#fff" /></View>
                      </View>
                      <AppText style={styles.storyName} numberOfLines={1}>{f.name.split(" ")[0]}</AppText>
                      <AppText style={styles.storyRel} numberOfLines={1}>{f.relation}</AppText>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              <AppText style={[styles.section, { marginTop: 20 }]}>Today&apos;s News</AppText>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card} testID={`news-${item.id}`} accessible accessibilityRole="text">
              <Image source={{ uri: item.image }} style={styles.cardImage} contentFit="cover" />
              <View style={styles.cardBody}>
                <AppText style={styles.source}>{item.source}</AppText>
                <AppText style={styles.title}>{item.title}</AppText>
                <AppText style={styles.summary}>{item.summary}</AppText>
              </View>
            </View>
          )}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={theme.colors.brand} style={{ marginVertical: 20 }} />
            ) : page === null && news.length > 0 ? (
              <AppText style={styles.feedEnd} testID="news-end">
                That&apos;s all the news for today.
              </AppText>
            ) : (
              <View style={{ height: 20 }} />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  headerTitle: { fontSize: theme.font.lg, fontWeight: "800", color: theme.colors.onSurface, flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  section: { fontSize: theme.font.lg, fontWeight: "800", color: theme.colors.onSurface, paddingHorizontal: 20, marginBottom: 12 },
  storiesRow: { paddingHorizontal: 16, gap: 14 },
  story: { alignItems: "center", width: 82 },
  ring: {
    width: 78, height: 78, borderRadius: 39, borderWidth: 3, borderColor: theme.colors.brandLight,
    alignItems: "center", justifyContent: "center", padding: 2,
  },
  avatar: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: theme.colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  ringBadge: {
    position: "absolute", bottom: -2, right: -2, width: 24, height: 24, borderRadius: 12,
    backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: theme.colors.surface,
  },
  bell: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute", top: 4, right: 2, minWidth: 20, height: 20, borderRadius: 10,
    paddingHorizontal: 5, backgroundColor: theme.colors.error,
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.colors.surface,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  storyName: { marginTop: 8, fontSize: theme.font.sm, fontWeight: "700", color: theme.colors.onSurface },
  storyRel: { fontSize: theme.font.xs, color: theme.colors.muted },
  inviteCard: {
    flexDirection: "row", alignItems: "center", gap: 14, marginHorizontal: 20,
    backgroundColor: theme.colors.brandLight, borderRadius: theme.radius.lg, padding: 18, minHeight: 88,
  },
  inviteIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: theme.colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  inviteTitle: { fontSize: theme.font.md, fontWeight: "800", color: theme.colors.onSurface },
  inviteSub: { fontSize: theme.font.sm, color: theme.colors.onSurfaceSecondary, marginTop: 2, lineHeight: 21 },
  card: {
    backgroundColor: theme.colors.surfaceSecondary, borderRadius: 24, overflow: "hidden",
    marginHorizontal: 20, marginBottom: 16, borderWidth: 1, borderColor: theme.colors.border,
  },
  cardImage: { width: "100%", height: 200 },
  cardBody: { padding: 16, gap: 8 },
  source: { fontSize: theme.font.xs, color: theme.colors.brand, fontWeight: "700" },
  title: { fontSize: theme.font.lg, fontWeight: "800", color: theme.colors.onSurface, lineHeight: 29 },
  summary: { fontSize: theme.font.base, color: theme.colors.onSurfaceSecondary, lineHeight: 24 },
  feedEnd: {
    fontSize: theme.font.base, color: theme.colors.muted, textAlign: "center",
    paddingVertical: 28, paddingHorizontal: 20,
  },
});
