import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator, Platform, Dimensions } from "react-native";
import { AppText } from "@/src/components/AppText";
import { GradientButton } from "@/src/components/GradientButton";
import { QuickConnect } from "@/src/components/QuickConnect";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as MediaLibrary from "expo-media-library";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { apiFetch, getToken } from "@/src/api";
import { useAuth } from "@/src/auth";
import { API, theme } from "@/src/theme";

type Photo = {
  id: string;
  from_user_id: string;
  from_name: string;
  from_role: string;
  caption?: string;
  created_at: string;
  /** Sample content is hosted; real uploads stream from our storage. */
  external_url?: string | null;
  demo?: boolean;
};

const photoUri = (p: Photo, token: string) =>
  p.external_url || `${API}/family/photos/${p.id}/image?token=${encodeURIComponent(token)}`;

const COLS = 3;
const GAP = 6;
const TILE = (Dimensions.get("window").width - 40 - GAP * (COLS - 1)) / COLS;

export default function FamilyGallery() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [shared, setShared] = useState<Photo[]>([]);
  const [device, setDevice] = useState<MediaLibrary.Asset[]>([]);
  const [deviceState, setDeviceState] = useState<"idle" | "loading" | "denied" | "unsupported" | "ready">("idle");
  const [token, setToken] = useState("");
  const [viewer, setViewer] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  const isSelf = user?.id === id;

  const load = useCallback(async () => {
    try {
      const [p, t] = await Promise.all([
        apiFetch<Photo[]>(`/family/photos?member_id=${id}`),
        apiFetch<{ token: string }>("/media-token", { method: "POST" }).catch(() => ({ token: "" })),
      ]);
      setShared(p);
      setToken(t.token);
    } catch {}
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  /**
   * Recent photos from this phone.
   *
   * Note this is the whole camera roll, not "photos of this person" — neither
   * iOS nor Android exposes per-person albums to an app, and face matching would
   * mean shipping recognition of our own. Labelled honestly in the UI.
   */
  const loadDevice = useCallback(async () => {
    if (Platform.OS === "web") { setDeviceState("unsupported"); return; }
    setDeviceState("loading");
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) { setDeviceState("denied"); return; }
      const res = await MediaLibrary.getAssetsAsync({ first: 60, mediaType: "photo", sortBy: "creationTime" });
      setDevice(res.assets);
      setDeviceState("ready");
    } catch {
      setDeviceState("unsupported");
    }
  }, []);

  const sharePhoto = useCallback(async (uri?: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    let pick = uri;
    if (!pick) {
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      pick = res.assets[0].uri;
    }
    setSharing(true);
    try {
      const t = await getToken();
      const form = new FormData();
      form.append("file", { uri: pick, name: pick.split("/").pop() || "photo.jpg", type: "image/jpeg" } as any);
      await fetch(`${API}/family/photos`, { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: form });
      await load();
    } catch {
      // The gallery simply won't gain the photo; nothing is lost.
    }
    setSharing(false);
  }, [load]);

  const who = name || shared[0]?.from_name || "Family";

  return (
    <View style={styles.root} testID="family-gallery">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.hBtn} testID="gallery-back"
          accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={28} color={theme.colors.onSurface} />
        </Pressable>
        <AppText style={styles.hTitle} numberOfLines={1}>{isSelf ? "Photos you shared" : who}</AppText>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.brand} /></View>
      ) : (
        <FlatList
          data={shared}
          keyExtractor={(p) => p.id}
          numColumns={COLS}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{ padding: 20, gap: GAP, paddingBottom: insets.bottom + 32 }}
          ListHeaderComponent={
            <View style={{ gap: 12, marginBottom: 12 }}>
              {/* Reaching them comes before looking at pictures of them. */}
              {!isSelf && id ? (
                <>
                  <QuickConnect memberId={String(id)} memberName={who} />
                  <View style={styles.rule} />
                </>
              ) : null}
              <AppText style={styles.section}>
                {shared.length > 0
                  ? `${shared.length} photo${shared.length === 1 ? "" : "s"} shared in Sunshine`
                  : "No photos shared yet"}
              </AppText>
              {shared.length === 0 && (
                <AppText style={styles.hint}>
                  {isSelf
                    ? "Share a photo and your family will be told straight away."
                    : `When ${who} shares a photo it will appear here.`}
                </AppText>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.tile}
              onPress={() => setViewer(photoUri(item, token))}
              testID={`photo-${item.id}`}
              accessibilityRole="imagebutton"
              accessibilityLabel={item.caption || `Photo from ${item.from_name}`}
            >
              <Image source={{ uri: photoUri(item, token) }} style={styles.tileImg} contentFit="cover" />
              {item.caption ? (
                <View style={styles.captionWrap}>
                  <AppText style={styles.caption} numberOfLines={1}>{item.caption}</AppText>
                </View>
              ) : null}
            </Pressable>
          )}
          ListFooterComponent={
            <View style={{ marginTop: 24, gap: 12 }}>
              <GradientButton tone="brand" style={styles.shareBtn} onPress={() => sharePhoto()} disabled={sharing}
                testID="share-photo" accessibilityRole="button" accessibilityLabel="Share a photo with your family">
                {sharing ? <ActivityIndicator color="#fff" /> : <Ionicons name="camera" size={22} color="#fff" />}
                <AppText style={styles.shareBtnText}>{sharing ? "  Sharing..." : "  Share a photo"}</AppText>
              </GradientButton>

              <AppText style={styles.section}>From this phone</AppText>
              <AppText style={styles.hint}>
                Recent photos on this device. Tap one to share it. Sunshine can&apos;t tell who is in a
                photo, so these are your latest pictures rather than only {isSelf ? "yours" : who + "'s"}.
              </AppText>

              {deviceState === "idle" ? (
                <Pressable style={styles.secondaryBtn} onPress={loadDevice} testID="load-device-photos"
                  accessibilityRole="button" accessibilityLabel="Show recent photos from this phone">
                  <AppText style={styles.secondaryBtnText}>Show my recent photos</AppText>
                </Pressable>
              ) : deviceState === "loading" ? (
                <ActivityIndicator color={theme.colors.brand} style={{ marginVertical: 16 }} />
              ) : deviceState === "denied" ? (
                <AppText style={styles.hint}>Allow photo access in Settings to see your pictures here.</AppText>
              ) : deviceState === "unsupported" ? (
                <AppText style={styles.hint}>Your phone&apos;s photos are available in the Sunshine app on your phone.</AppText>
              ) : (
                <View style={styles.deviceGrid}>
                  {device.map((a) => (
                    <Pressable key={a.id} style={styles.tile} onPress={() => sharePhoto(a.uri)}
                      testID={`device-photo-${a.id}`}
                      accessibilityRole="imagebutton" accessibilityLabel="Share this photo from your phone">
                      <Image source={{ uri: a.uri }} style={styles.tileImg} contentFit="cover" />
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          }
        />
      )}

      {viewer && (
        <View style={styles.viewer} testID="photo-viewer">
          <Image source={{ uri: viewer }} style={styles.viewerImg} contentFit="contain" />
          <Pressable style={[styles.viewerClose, { top: insets.top + 12 }]} onPress={() => setViewer(null)}
            hitSlop={12} testID="photo-viewer-close"
            accessibilityRole="button" accessibilityLabel="Close photo">
            <Ionicons name="close" size={32} color="#fff" />
          </Pressable>
        </View>
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
  hTitle: { flex: 1, fontSize: theme.font.md, fontWeight: "800", color: theme.colors.onSurface, textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  section: { fontSize: theme.font.md, fontWeight: "800", color: theme.colors.onSurface },
  rule: { height: 1, backgroundColor: theme.colors.border, marginVertical: 12 },
  hint: { fontSize: theme.font.sm, color: theme.colors.muted, lineHeight: 21 },
  tile: { width: TILE, height: TILE, borderRadius: theme.radius.md, overflow: "hidden", backgroundColor: theme.colors.surfaceTertiary },
  tileImg: { width: "100%", height: "100%" },
  captionWrap: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)", padding: 6 },
  caption: { color: "#fff", fontSize: 12, fontWeight: "600" },
  deviceGrid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  shareBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.brand, borderRadius: theme.radius.pill, paddingVertical: 18, minHeight: 60,
  },
  shareBtnText: { color: "#fff", fontSize: theme.font.md, fontWeight: "800" },
  secondaryBtn: {
    backgroundColor: theme.colors.surfaceTertiary, borderRadius: theme.radius.pill,
    paddingVertical: 16, alignItems: "center", minHeight: 56, justifyContent: "center",
  },
  secondaryBtnText: { color: theme.colors.onSurface, fontSize: theme.font.base, fontWeight: "700" },
  viewer: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.94)", alignItems: "center", justifyContent: "center" },
  viewerImg: { width: "92%", height: "80%" },
  viewerClose: {
    position: "absolute", right: 16, width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center",
  },
});
