import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, FlatList, Dimensions, Pressable, ScrollView, ActivityIndicator, ViewToken, Platform } from "react-native";
import { AppText } from "@/src/components/AppText";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { WebView } from "react-native-webview";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetch, logActivity } from "@/src/api";
import { CommentSheet } from "@/src/components/CommentSheet";
import { ReactionSheet } from "@/src/components/ReactionSheet";
import { useFeatures } from "@/src/features";
import { useScrollChrome } from "@/src/scroll-context";
import { theme } from "@/src/theme";

const { width: SCREEN_W } = Dimensions.get("window");

type Reel = {
  id: string; creator: string; creator_avatar: string; title: string; description: string;
  category: string; video_url: string; thumbnail_url: string;
  /** Set for real music we do not own: played through YouTube's own embed. */
  youtube_id?: string;
  likes: number; liked: boolean; reactions: Record<string, number>; my_reaction: string | null; comment_count: number;
};

/**
 * A YouTube embed sized to the reel.
 *
 * Devotional recordings belong to whoever made them, so the honest way to carry
 * real music is the rights holder's own player rather than a file we host. The
 * chrome is hidden and the reel's own overlay sits on top, so it still reads as
 * part of the feed instead of a browser dropped into it.
 */
function YouTubeReel({ id, active }: { id: string; active: boolean }) {
  const src =
    `https://www.youtube.com/embed/${id}` +
    `?autoplay=${active ? 1 : 0}&mute=0&controls=0&modestbranding=1&rel=0&playsinline=1&loop=1&playlist=${id}`;
  if (Platform.OS === "web") {
    return (
      // A DOM element, reachable only on web — Metro never bundles this branch native.
      <iframe
        key={`${id}-${active}`}
        src={src}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
        allow="autoplay; encrypted-media"
        title="Video"
      />
    );
  }
  return (
    <WebView
      key={`${id}-${active}`}
      source={{ uri: src }}
      style={StyleSheet.absoluteFill}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      javaScriptEnabled
      scrollEnabled={false}
    />
  );
}

export default function ElderContent() {
  const insets = useSafeAreaInsets();
  const [reels, setReels] = useState<Reel[]>([]);
  const [cat, setCat] = useState("All");
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  // Start at the window height rather than zero.
  //
  // Tabs stay mounted, so this screen is first laid out while hidden and
  // `onLayout` reports a height of 0. Nothing re-measures it when the tab
  // becomes visible, so a feed gated on a non-zero height showed a spinner
  // forever. The window is a good enough opening guess, and the measurement
  // below refines it the moment a real one arrives.
  const [itemH, setItemH] = useState(Dimensions.get("window").height);
  const [reactFor, setReactFor] = useState<Reel | null>(null);
  const [commentFor, setCommentFor] = useState<Reel | null>(null);
  const [toast, setToast] = useState("");
  const { setChromeSuppressed } = useScrollChrome();
  const { features } = useFeatures();

  // Only the subjects the elder asked for, with "All" meaning all of *those*.
  // Memoised so the chip list keeps a stable identity between renders — the
  // effect below watches it, and a fresh array every render would re-run it.
  const CATS = useMemo(() => ["All", ...features.watch_categories], [features.watch_categories]);

  // Hide the floating assistant/SOS buttons whenever a reaction or comment
  // sheet is open, so a tap on the sheet never lands on the FAB behind it.
  const anySheetOpen = Boolean(reactFor || commentFor);
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  useEffect(() => {
    setChromeSuppressed(focused && anySheetOpen);
  }, [focused, anySheetOpen, setChromeSuppressed]);
  useEffect(() => () => setChromeSuppressed(false), [setChromeSuppressed]);

  const load = useCallback(async (c: string) => {
    setLoading(true);
    try {
      const url = c === "All" ? "/content" : `/content?category=${c}`;
      const all = await apiFetch<Reel[]>(url);
      // "All" is the whole catalogue, so the elder's chosen subjects are applied
      // here — otherwise unticking a subject would still leave it in this feed.
      setReels(c === "All" ? all.filter((r) => features.watch_categories.includes(r.category)) : all);
      setActive(0);
    } catch {}
    setLoading(false);
  }, [features.watch_categories]);

  useEffect(() => { logActivity("Watch"); }, []);
  // A subject the family switched off while it was the active chip would
  // otherwise leave the elder staring at an empty feed they can't get out of.
  useEffect(() => { if (!CATS.includes(cat)) setCat("All"); }, [CATS, cat]);
  useEffect(() => { load(cat); }, [cat, load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const patchReel = (id: string, patch: Partial<Reel>) => {
    setReels((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const toggleLike = async (reel: Reel) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Instant feedback; reconciled with the server's count right after.
    patchReel(reel.id, { liked: !reel.liked, likes: reel.likes + (reel.liked ? -1 : 1) });
    try {
      const saved = await apiFetch<Reel>(`/content/${reel.id}/like`, { method: "POST" });
      patchReel(reel.id, saved);
    } catch {
      patchReel(reel.id, reel);
    }
  };

  const shareWithFamily = async (reel: Reel) => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await apiFetch(`/content/${reel.id}/share`, { method: "POST" });
      setToast(`Shared "${reel.title}" with your family`);
    } catch {
      setToast("Could not share that just now");
    }
  };

  const viewCfg = useRef({ itemVisiblePercentThreshold: 80 }).current;
  const onView = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length && viewableItems[0].index != null) setActive(viewableItems[0].index);
  }).current;

  return (
    <View
      style={styles.root}
      testID="elder-content"
      // Ignore zero: that is the hidden-tab measurement, not a real one.
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0) setItemH(h);
      }}
    >
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.marigold} /></View>
      ) : (
        <FlatList
          data={reels}
          keyExtractor={(i) => i.id}
          pagingEnabled
          snapToInterval={itemH}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onView}
          viewabilityConfig={viewCfg}
          getItemLayout={(_, index) => ({ length: itemH, offset: itemH * index, index })}
          renderItem={({ item, index }) => (
            <ReelItem
              reel={item}
              active={index === active}
              height={itemH}
              onLike={() => toggleLike(item)}
              onReact={() => setReactFor(item)}
              onComment={() => setCommentFor(item)}
              onShare={() => shareWithFamily(item)}
            />
          )}
        />
      )}

      <LinearGradient pointerEvents="box-none" colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0)"]} style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <AppText style={styles.title}>Watch</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {CATS.map((c) => {
            const on = c === cat;
            return (
              <Pressable key={c} style={[styles.chip, on && styles.chipOn]} onPress={() => { if (Platform.OS !== "web") Haptics.selectionAsync(); setCat(c); }} testID={`content-chip-${c.toLowerCase()}`}>
                <AppText style={[styles.chipText, on && styles.chipTextOn]}>{c}</AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      </LinearGradient>

      {reactFor && (
        <ReactionSheet
          item={reactFor}
          title={reactFor.title}
          endpoint={(id) => `/content/${id}/react`}
          onChange={(next) => patchReel(reactFor.id, next as Partial<Reel>)}
          onClose={() => setReactFor(null)}
        />
      )}
      {commentFor && (
        <CommentSheet
          contentId={commentFor.id}
          title={commentFor.title}
          onCountChange={(count) => patchReel(commentFor.id, { comment_count: count })}
          onClose={() => setCommentFor(null)}
        />
      )}
      {!!toast && (
        <View style={[styles.toast, { bottom: insets.bottom + 100 }]} pointerEvents="none">
          <AppText style={styles.toastText}>{toast}</AppText>
        </View>
      )}
    </View>
  );
}

function ReelItem({
  reel, active, height, onLike, onReact, onComment, onShare,
}: { reel: Reel; active: boolean; height: number; onLike: () => void; onReact: () => void; onComment: () => void; onShare: () => void }) {
  const insets = useSafeAreaInsets();
  const embedded = Boolean(reel.youtube_id);
  // An embedded player owns its own playback, so the local player is only fed a
  // source when we are the ones streaming it.
  const player = useVideoPlayer(embedded ? null : reel.video_url, (p) => { p.loop = true; });
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (embedded) return;
    if (active) { player.play(); setPlaying(true); } else player.pause();
  }, [active, player, embedded]);

  const toggle = () => {
    if (embedded) return;
    if (playing) { player.pause(); setPlaying(false); } else { player.play(); setPlaying(true); }
  };
  const myTopReaction = Object.entries(reel.reactions || {}).sort((a, b) => b[1] - a[1])[0];

  return (
    <View style={[styles.reel, { height }]} testID={`reel-${reel.id}`}>
      {embedded ? (
        <YouTubeReel id={reel.youtube_id!} active={active} />
      ) : (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      )}
      {/* The wash exists to make overlay text readable over our own footage.
          A real recording is the point of the screen, so it stays clear. */}
      {!embedded && (
        <Image source={{ uri: reel.thumbnail_url }} style={[StyleSheet.absoluteFill, { opacity: 0.55 }]} contentFit="cover" />
      )}
      <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"]} style={styles.bottomScrim} pointerEvents="none" />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={playing ? `Pause ${reel.title}` : `Play ${reel.title}`}
      >
        {!playing && <View style={styles.playWrap}><View style={styles.play}><Ionicons name="play" size={44} color="#fff" /></View></View>}
      </Pressable>
      <View style={[styles.rail, { bottom: insets.bottom + theme.fabClearance }]}>
        <Pressable
          style={styles.railBtn}
          onPress={onLike}
          testID={`like-${reel.id}`}
          accessibilityRole="button"
          accessibilityLabel={reel.liked ? "Remove like" : "Like this video"}
        >
          <View style={styles.railCircle}><Ionicons name={reel.liked ? "heart" : "heart-outline"} size={30} color={reel.liked ? theme.colors.marigold : "#fff"} /></View>
          <AppText style={styles.railLabel}>{reel.likes}</AppText>
        </Pressable>
        <Pressable
          style={styles.railBtn}
          onPress={onReact}
          testID={`react-${reel.id}`}
          accessibilityRole="button"
          accessibilityLabel="Choose a reaction"
        >
          <View style={styles.railCircle}>
            <Ionicons name={reel.my_reaction ? "happy" : "happy-outline"} size={28} color={reel.my_reaction ? theme.colors.marigold : "#fff"} />
          </View>
          <AppText style={styles.railLabel}>{myTopReaction ? myTopReaction[1] : "React"}</AppText>
        </Pressable>
        <Pressable
          style={styles.railBtn}
          onPress={onComment}
          testID={`comment-${reel.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Comments, ${reel.comment_count}`}
        >
          <View style={styles.railCircle}><Ionicons name="chatbubble-ellipses-outline" size={26} color="#fff" /></View>
          <AppText style={styles.railLabel}>{reel.comment_count || "Comment"}</AppText>
        </Pressable>
        <Pressable
          style={styles.railBtn}
          onPress={onShare}
          testID={`share-${reel.id}`}
          accessibilityRole="button"
          accessibilityLabel="Share this video with your family"
        >
          <View style={styles.railCircle}><Ionicons name="people" size={26} color="#fff" /></View>
          <AppText style={styles.railLabel}>Family</AppText>
        </Pressable>
      </View>
      <View style={[styles.info, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.catPill}><AppText style={styles.catPillText}>{reel.category}</AppText></View>
        <View style={styles.creatorRow}>
          <Image source={{ uri: reel.creator_avatar }} style={styles.creatorAv} />
          <AppText style={styles.creator}>{reel.creator}</AppText>
        </View>
        <AppText style={styles.reelTitle}>{reel.title}</AppText>
        <AppText style={styles.reelDesc} numberOfLines={2}>{reel.description}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
  reel: { width: SCREEN_W, backgroundColor: "#000" },
  bottomScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 300 },
  playWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  play: { width: 88, height: 88, borderRadius: 44, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingBottom: 12 },
  title: { color: "#fff", fontSize: 24, fontWeight: "800", textAlign: "center", marginBottom: 10 },
  chipRow: { paddingHorizontal: 16, gap: 10 },
  chip: { paddingHorizontal: 18, height: 40, borderRadius: 999, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.6)", justifyContent: "center", flexShrink: 0 },
  chipOn: { backgroundColor: theme.colors.marigold, borderColor: theme.colors.marigold },
  chipText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  chipTextOn: { color: theme.colors.onMarigold },
  rail: { position: "absolute", right: 14, gap: 16, alignItems: "center" },
  railBtn: { alignItems: "center", gap: 4 },
  railCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  railLabel: { color: "#fff", fontSize: 13, fontWeight: "700" },
  info: { position: "absolute", left: 16, right: 90, bottom: 0, gap: 6 },
  catPill: { alignSelf: "flex-start", backgroundColor: theme.colors.marigold, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  catPillText: { color: theme.colors.onMarigold, fontWeight: "800", fontSize: 13 },
  creatorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  creatorAv: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#444" },
  creator: { color: "#fff", fontSize: 16, fontWeight: "700" },
  reelTitle: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 4 },
  reelDesc: { color: "rgba(255,255,255,0.9)", fontSize: 16, lineHeight: 22 },
  toast: {
    position: "absolute", left: 24, right: 24, backgroundColor: "rgba(20,20,20,0.92)",
    borderRadius: 16, paddingVertical: 14, paddingHorizontal: 18, alignItems: "center",
  },
  toastText: { color: "#fff", fontSize: 15, fontWeight: "700", textAlign: "center" },
});
