import { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, Platform, Linking } from "react-native";
import { AppText } from "@/src/components/AppText";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { theme } from "@/src/theme";

const AVATARS: Record<string, string> = {
  daughter: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&q=80",
  son: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&q=80",
  doctor: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&q=80",
};

export default function CallScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { name = "Family", who = "daughter" } = useLocalSearchParams<{ name: string; who: string }>();
  const [phase, setPhase] = useState<"connecting" | "connected">("connecting");
  const [muted, setMuted] = useState(false);
  const [video, setVideo] = useState(true);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setPhase("connected"), 2200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase !== "connected") return;
    const i = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(i);
  }, [phase]);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const end = () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const phoneCall = () => {
    Linking.openURL("tel:+919876543210").catch(() => {});
  };

  return (
    <View style={styles.root} testID="call-screen">
      <Image source={{ uri: AVATARS[String(who)] || AVATARS.daughter }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={video ? 0 : 30} />
      <View style={styles.overlay} />

      <View style={[styles.top, { paddingTop: insets.top + 20 }]}>
        <View style={styles.bigAvatarWrap}>
          <Image source={{ uri: AVATARS[String(who)] || AVATARS.daughter }} style={styles.bigAvatar} contentFit="cover" />
        </View>
        <AppText style={styles.name}>{name}</AppText>
        <AppText style={styles.status}>{phase === "connecting" ? "Connecting..." : `Video call • ${fmt(seconds)}`}</AppText>
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + 32 }]}>
        <Pressable
          style={styles.phoneRow}
          onPress={phoneCall}
          testID="phone-call"
          accessibilityRole="button"
          accessibilityLabel="Switch to a normal phone call"
        >
          <Ionicons name="call" size={20} color="#fff" />
          <AppText style={styles.phoneText}>Switch to phone call</AppText>
        </Pressable>
        <View style={styles.btnRow}>
          <CtrlBtn icon={muted ? "mic-off" : "mic"} label={muted ? "Unmute" : "Mute"} active={muted} onPress={() => setMuted(!muted)} testID="call-mute" />
          <Pressable
            style={[styles.ctrl, styles.endBtn]}
            onPress={end}
            testID="call-end"
            accessibilityRole="button"
            accessibilityLabel="End call"
          >
            <Ionicons name="call" size={36} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
          </Pressable>
          <CtrlBtn icon={video ? "videocam" : "videocam-off"} label={video ? "Video" : "Video off"} active={!video} onPress={() => setVideo(!video)} testID="call-video" />
        </View>
      </View>
    </View>
  );
}

function CtrlBtn({ icon, label, active, onPress, testID }: any) {
  return (
    <Pressable
      style={styles.ctrlWrap}
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.ctrl, active && styles.ctrlActive]}>
        <Ionicons name={icon} size={30} color={active ? theme.colors.onSurface : "#fff"} />
      </View>
      <AppText style={styles.ctrlLabel}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#111" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  top: { alignItems: "center", marginTop: 40 },
  bigAvatarWrap: { width: 160, height: 160, borderRadius: 80, borderWidth: 4, borderColor: "rgba(255,255,255,0.6)", overflow: "hidden" },
  bigAvatar: { width: "100%", height: "100%" },
  name: { color: "#fff", fontSize: 34, fontWeight: "800", marginTop: 20 },
  status: { color: "rgba(255,255,255,0.9)", fontSize: 18, marginTop: 6 },
  controls: { marginTop: "auto", alignItems: "center", gap: 20 },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  phoneText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  btnRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 32 },
  ctrlWrap: { alignItems: "center", gap: 8 },
  ctrl: { width: 68, height: 68, borderRadius: 34, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  ctrlActive: { backgroundColor: "#fff" },
  ctrlLabel: { color: "#fff", fontSize: 14, fontWeight: "600" },
  endBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.colors.error },
});
