import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  ViewToken,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme, API } from "@/src/theme";

const { width: SCREEN_W } = Dimensions.get("window");

const CATEGORIES = ["All", "Exercise", "Yoga", "Recipes", "Travel", "Music", "Tips", "Learning"];

type Reel = {
  id: string;
  creator: string;
  creator_avatar: string;
  title: string;
  description: string;
  category: string;
  video_url: string;
  thumbnail_url: string;
  likes: number;
  liked: boolean;
  saved: boolean;
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [reels, setReels] = useState<Reel[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [voiceReel, setVoiceReel] = useState<Reel | null>(null);
  const [itemHeight, setItemHeight] = useState(0);

  const loadReels = useCallback(async (cat: string) => {
    setLoading(true);
    try {
      const url = cat === "All" ? `${API}/reels` : `${API}/reels?category=${cat}`;
      const r = await fetch(url);
      const data = await r.json();
      setReels(data);
      setActiveIndex(0);
    } catch {
      setReels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReels(category);
  }, [category, loadReels]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const toggleLike = useCallback(async (reel: Reel) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setReels((prev) =>
      prev.map((r) =>
        r.id === reel.id ? { ...r, liked: !r.liked, likes: r.likes + (r.liked ? -1 : 1) } : r
      )
    );
    try {
      await fetch(`${API}/reels/${reel.id}/like`, { method: "POST" });
    } catch {}
  }, []);

  const toggleSave = useCallback(async (reel: Reel) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setReels((prev) => prev.map((r) => (r.id === reel.id ? { ...r, saved: !r.saved } : r)));
    try {
      await fetch(`${API}/reels/${reel.id}/save`, { method: "POST" });
    } catch {}
  }, []);

  return (
    <View
      style={styles.root}
      testID="home-reels"
      onLayout={(e) => setItemHeight(e.nativeEvent.layout.height)}
    >
      <StatusBar barStyle="light-content" />
      {loading || itemHeight === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={theme.colors.brand} />
        </View>
      ) : (
        <FlatList
          data={reels}
          keyExtractor={(i) => i.id}
          renderItem={({ item, index }) => (
            <ReelItem
              reel={item}
              isActive={index === activeIndex}
              height={itemHeight}
              onLike={() => toggleLike(item)}
              onSave={() => toggleSave(item)}
              onVoice={() => setVoiceReel(item)}
            />
          )}
          pagingEnabled
          snapToInterval={itemHeight}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({ length: itemHeight, offset: itemHeight * index, index })}
        />
      )}

      {/* Top overlay: For You + categories */}
      <LinearGradient
        pointerEvents="box-none"
        colors={["rgba(0,0,0,0.65)", "rgba(0,0,0,0)"]}
        style={[styles.topScrim, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.topRow}>
          <Text style={styles.forYou} testID="for-you-title">
            For You <Ionicons name="sunny" size={22} color="#FFD98A" />
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {CATEGORIES.map((c) => {
            const active = c === category;
            return (
              <Pressable
                key={c}
                testID={`chip-${c.toLowerCase()}`}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                  setCategory(c);
                }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </LinearGradient>

      {voiceReel && (
        <VoiceOverlay reel={voiceReel} onClose={() => setVoiceReel(null)} />
      )}
    </View>
  );
}

function ReelItem({
  reel,
  isActive,
  height,
  onLike,
  onSave,
  onVoice,
}: {
  reel: Reel;
  isActive: boolean;
  height: number;
  onLike: () => void;
  onSave: () => void;
  onVoice: () => void;
}) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(reel.video_url, (p) => {
    p.loop = true;
    p.muted = false;
  });
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (isActive) {
      player.play();
      setPlaying(true);
    } else {
      player.pause();
    }
  }, [isActive, player]);

  const togglePlay = () => {
    if (playing) {
      player.pause();
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
    }
  };

  return (
    <View style={[styles.reel, { height }]} testID={`reel-${reel.id}`}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />
      {/* Poster fallback under video for slow networks / unsupported web codecs */}
      <Image source={{ uri: reel.thumbnail_url }} style={[StyleSheet.absoluteFill, { opacity: 0.6 }]} contentFit="cover" />

      {/* Bottom scrim */}
      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"]}
        style={styles.bottomScrim}
        pointerEvents="none"
      />

      {/* Tap to play/pause */}
      <Pressable style={styles.playTap} onPress={togglePlay}>
        {!playing && (
          <View style={styles.playCircle}>
            <Ionicons name="play" size={44} color="#fff" />
          </View>
        )}
      </Pressable>

      {/* Right rail actions */}
      <View style={[styles.rightRail, { bottom: insets.bottom + 190 }]}>
        <RailAction
          testID={`reel-like-${reel.id}`}
          icon={reel.liked ? "heart" : "heart-outline"}
          label={formatK(reel.likes)}
          color={reel.liked ? theme.colors.brand : "#fff"}
          onPress={onLike}
        />
        <RailAction
          testID={`reel-save-${reel.id}`}
          icon={reel.saved ? "bookmark" : "bookmark-outline"}
          label="Save"
          color={reel.saved ? theme.colors.brand : "#fff"}
          onPress={onSave}
        />
        <RailAction
          testID={`reel-share-${reel.id}`}
          icon="share-social-outline"
          label="Share"
          color="#fff"
          onPress={() => Platform.OS !== "web" && Haptics.selectionAsync()}
        />
        <RailAction
          testID={`reel-voice-${reel.id}`}
          icon="mic"
          label="Voice"
          color="#fff"
          onPress={onVoice}
        />
      </View>

      {/* Bottom info */}
      <View style={[styles.bottomInfo, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.catPill}>
          <Text style={styles.catPillText}>{reel.category}</Text>
        </View>
        <View style={styles.creatorRow}>
          <Image source={{ uri: reel.creator_avatar }} style={styles.creatorAvatar} />
          <Text style={styles.creatorName}>{reel.creator}</Text>
        </View>
        <Text style={styles.reelTitle}>{reel.title}</Text>
        <Text style={styles.reelDesc} numberOfLines={2}>
          {reel.description}
        </Text>
        <Text style={styles.swipeHint}>
          <Ionicons name="chevron-up" size={14} color="rgba(255,255,255,0.85)" /> Swipe for next
        </Text>
      </View>
    </View>
  );
}

function RailAction({ icon, label, color, onPress, testID }: any) {
  return (
    <Pressable style={styles.railBtn} onPress={onPress} testID={testID} hitSlop={12}>
      <View style={styles.railCircle}>
        <Ionicons name={icon} size={28} color={color} />
      </View>
      <Text style={styles.railLabel}>{label}</Text>
    </Pressable>
  );
}

function VoiceOverlay({ reel, onClose }: { reel: Reel; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const suggestions = ["Explain this slowly", "Is this safe for me?", "What do I need?"];

  const ask = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setAnswer(null);
    try {
      const res = await fetch(`${API}/voice/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reel_title: reel.title,
          reel_description: reel.description,
          question: q,
        }),
      });
      const data = await res.json();
      setAnswer(data.answer || "Sorry, I couldn't answer that.");
    } catch {
      setAnswer("Sorry, I'm having trouble right now. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.voiceBackdrop} testID="voice-overlay">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.voiceSheet}
      >
        <View style={styles.voiceHandle} />
        <View style={styles.voiceHeader}>
          <View style={styles.voiceMicWrap}>
            <Ionicons name="mic" size={26} color={theme.colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.voiceTitle}>Ask about this video</Text>
            <Text style={styles.voiceSub} numberOfLines={1}>{reel.title}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} testID="voice-close">
            <Ionicons name="close" size={28} color={theme.colors.onSurface} />
          </Pressable>
        </View>

        <View style={styles.suggestionsRow}>
          {suggestions.map((s) => (
            <Pressable key={s} style={styles.suggestion} onPress={() => { setQuestion(s); ask(s); }}>
              <Text style={styles.suggestionText}>{s}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.voiceInputRow}>
          <TextInput
            style={styles.voiceInput}
            placeholder="Type your question..."
            placeholderTextColor={theme.colors.muted}
            value={question}
            onChangeText={setQuestion}
            multiline
            testID="voice-input"
          />
          <Pressable
            style={[styles.voiceSend, !question.trim() && { opacity: 0.5 }]}
            onPress={() => ask(question)}
            disabled={!question.trim() || loading}
            testID="voice-send"
          >
            <Ionicons name="arrow-up" size={22} color="#fff" />
          </Pressable>
        </View>

        {loading && (
          <View style={styles.voiceAnswer}>
            <ActivityIndicator color={theme.colors.brand} />
            <Text style={styles.voiceAnswerText}>Thinking...</Text>
          </View>
        )}
        {answer && !loading && (
          <View style={styles.voiceAnswer} testID="voice-answer">
            <Text style={styles.voiceAnswerText}>{answer}</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

function formatK(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
  reel: { width: SCREEN_W, backgroundColor: "#000", position: "relative" },
  bottomScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 320 },
  playTap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  playCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  topScrim: { position: "absolute", top: 0, left: 0, right: 0, paddingBottom: 12 },
  topRow: { alignItems: "center", marginBottom: 12 },
  forYou: { color: "#fff", fontSize: 22, fontWeight: "800" },
  chipRow: { paddingHorizontal: 16, gap: 10 },
  chip: {
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.55)",
    justifyContent: "center",
    flexShrink: 0,
  },
  chipActive: {
    backgroundColor: theme.colors.brand,
    borderColor: theme.colors.brand,
  },
  chipText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  chipTextActive: { color: "#fff", fontWeight: "800" },

  rightRail: { position: "absolute", right: 12, gap: 16, alignItems: "center" },
  railBtn: { alignItems: "center", gap: 4 },
  railCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  railLabel: { color: "#fff", fontSize: 13, fontWeight: "600" },

  bottomInfo: { position: "absolute", left: 16, right: 90, bottom: 0, gap: 6 },
  catPill: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.brand,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 6,
  },
  catPillText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  creatorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  creatorAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#444" },
  creatorName: { color: "#fff", fontSize: 16, fontWeight: "700" },
  reelTitle: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 4 },
  reelDesc: { color: "rgba(255,255,255,0.9)", fontSize: 16, lineHeight: 22 },
  swipeHint: { color: "rgba(255,255,255,0.75)", fontSize: 13, textAlign: "center", marginTop: 8 },

  voiceBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  voiceSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 16,
  },
  voiceHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.borderStrong,
  },
  voiceHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  voiceMicWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: theme.colors.brandLight,
    alignItems: "center", justifyContent: "center",
  },
  voiceTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.onSurface },
  voiceSub: { fontSize: 14, color: theme.colors.muted, marginTop: 2 },
  suggestionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  suggestion: {
    backgroundColor: theme.colors.surfaceSecondary,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 999,
  },
  suggestionText: { fontSize: 15, color: theme.colors.onSurface, fontWeight: "600" },
  voiceInputRow: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 20,
    padding: 8,
  },
  voiceInput: {
    flex: 1,
    fontSize: 17,
    color: theme.colors.onSurface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    maxHeight: 100,
  },
  voiceSend: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: theme.colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  voiceAnswer: {
    backgroundColor: theme.colors.brandLight,
    padding: 16,
    borderRadius: 20,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  voiceAnswerText: { fontSize: 17, lineHeight: 24, color: theme.colors.onSurface, flex: 1, fontWeight: "500" },
});
