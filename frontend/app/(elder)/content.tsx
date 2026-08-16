import { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, FlatList, Dimensions, Pressable, ScrollView, ActivityIndicator, ViewToken, Platform } from "react-native";
import { AppText } from "@/src/components/AppText";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetch, logActivity } from "@/src/api";
import { theme } from "@/src/theme";

const { width: SCREEN_W } = Dimensions.get("window");
const CATS = ["All", "Spiritual", "Bhajans", "Songs", "Devotional", "Exercise", "Yoga", "Recipes", "Travel"];

type Reel = { id: string; creator: string; creator_avatar: string; title: string; description: string; category: string; video_url: string; thumbnail_url: string; likes: number };

export default function ElderContent() {
  const insets = useSafeAreaInsets();
  const [reels, setReels] = useState<Reel[]>([]);
  const [cat, setCat] = useState("All");
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [itemH, setItemH] = useState(0);
  const [liked, setLiked] = useState<Record<string, boolean>>({});

  const load = useCallback(async (c: string) => {
    setLoading(true);
    try {
      const url = c === "All" ? "/content" : `/content?category=${c}`;
      setReels(await apiFetch<Reel[]>(url));
      setActive(0);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { logActivity("Watch"); }, []);
  useEffect(() => { load(cat); }, [cat, load]);

  const viewCfg = useRef({ itemVisiblePercentThreshold: 80 }).current;
  const onView = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length && viewableItems[0].index != null) setActive(viewableItems[0].index);
  }).current;

  return (
    <View style={styles.root} testID="elder-content" onLayout={(e) => setItemH(e.nativeEvent.layout.height)}>
      {loading || itemH === 0 ? (
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
            <ReelItem reel={item} active={index === active} height={itemH} liked={!!liked[item.id]} onLike={() => { if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setLiked((p) => ({ ...p, [item.id]: !p[item.id] })); }} />
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
    </View>
  );
}

function ReelItem({ reel, active, height, liked, onLike }: { reel: Reel; active: boolean; height: number; liked: boolean; onLike: () => void }) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(reel.video_url, (p) => { p.loop = true; });
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (active) { player.play(); setPlaying(true); } else player.pause();
  }, [active, player]);

  const toggle = () => { if (playing) { player.pause(); setPlaying(false); } else { player.play(); setPlaying(true); } };

  return (
    <View style={[styles.reel, { height }]} testID={`reel-${reel.id}`}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <Image source={{ uri: reel.thumbnail_url }} style={[StyleSheet.absoluteFill, { opacity: 0.55 }]} contentFit="cover" />
      <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"]} style={styles.bottomScrim} pointerEvents="none" />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={playing ? `Pause ${reel.title}` : `Play ${reel.title}`}
      >
        {!playing && <View style={styles.playWrap}><View style={styles.play}><Ionicons name="play" size={44} color="#fff" /></View></View>}
      </Pressable>
      <View style={[styles.rail, { bottom: insets.bottom + 24 }]}>
        <Pressable
          style={styles.railBtn}
          onPress={onLike}
          testID={`like-${reel.id}`}
          accessibilityRole="button"
          accessibilityLabel={liked ? "Remove like" : "Like this video"}
        >
          <View style={styles.railCircle}><Ionicons name={liked ? "heart" : "heart-outline"} size={30} color={liked ? theme.colors.marigold : "#fff"} /></View>
          <AppText style={styles.railLabel}>{liked ? reel.likes + 1 : reel.likes}</AppText>
        </Pressable>
        <Pressable
          style={styles.railBtn}
          testID={`share-${reel.id}`}
          accessibilityRole="button"
          accessibilityLabel="Share this video"
        >
          <View style={styles.railCircle}><Ionicons name="share-social" size={28} color="#fff" /></View>
          <AppText style={styles.railLabel}>Share</AppText>
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
  rail: { position: "absolute", right: 14, gap: 18, alignItems: "center" },
  railBtn: { alignItems: "center", gap: 4 },
  railCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  railLabel: { color: "#fff", fontSize: 13, fontWeight: "700" },
  info: { position: "absolute", left: 16, right: 90, bottom: 0, gap: 6 },
  catPill: { alignSelf: "flex-start", backgroundColor: theme.colors.marigold, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  catPillText: { color: theme.colors.onMarigold, fontWeight: "800", fontSize: 13 },
  creatorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  creatorAv: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#444" },
  creator: { color: "#fff", fontSize: 16, fontWeight: "700" },
  reelTitle: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 4 },
  reelDesc: { color: "rgba(255,255,255,0.9)", fontSize: 16, lineHeight: 22 },
});
