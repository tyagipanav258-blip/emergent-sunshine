import { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { AppText } from "@/src/components/AppText";
import { AlertSettings } from "@/src/components/AlertSettings";
import { GradientFill } from "@/src/components/GradientFill";
import { GradientButton } from "@/src/components/GradientButton";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";

export default function ChildProfile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="child-profile">
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            {user?.photo_url ? (
              <Image source={{ uri: user.photo_url }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <Ionicons name="person" size={44} color={theme.colors.brand} />
            )}
          </View>
          <AppText style={styles.name}>{user?.name}</AppText>
          <AppText style={styles.sub}>{user?.email}</AppText>
        </View>

        <View style={styles.linkCard} testID="linked-parent">
          <Ionicons name="link" size={26} color={theme.colors.brand} />
          <View style={{ flex: 1 }}>
            <AppText style={styles.linkLabel}>Connected to</AppText>
            <AppText style={styles.linkValue}>{user?.elder_name || "Your parent"}</AppText>
          </View>
          <View style={styles.livePill}><View style={styles.liveDot} /><AppText style={styles.liveText}>Linked</AppText></View>
        </View>

        <View style={styles.rows}>
          {[
            { icon: "notifications", label: "Alerts & notifications", sub: "SOS, low medicine, missed doses", go: "/notifications" },
            { icon: "card", label: "Requests & payments", sub: "What Sunshine arranged and what is owed", go: "/(child)/tasks" },
            { icon: "images", label: "Photos & voice notes", sub: "Everything shared in your family", go: "family" },
            { icon: "help-circle", label: "Help & support", sub: "We're here to help", go: "help" },
          ].map((r, i, arr) => (
            <View key={r.label}>
              <Pressable
                style={styles.row}
                testID={`crow-${r.label}`}
                accessibilityRole="button"
                accessibilityLabel={`${r.label}. ${r.sub}`}
                onPress={() => {
                  if (r.go === "family") {
                    router.push({ pathname: "/family/[id]", params: { id: user?.elder_id || "", name: user?.elder_name || "" } });
                  } else if (r.go === "help") {
                    setHelpOpen(true);
                  } else {
                    router.push(r.go as any);
                  }
                }}
              >
                <View style={styles.rowIcon}><Ionicons name={r.icon as any} size={22} color={theme.colors.brand} /></View>
                <View style={{ flex: 1 }}>
                  <AppText style={styles.rowLabel}>{r.label}</AppText>
                  <AppText style={styles.rowSub}>{r.sub}</AppText>
                </View>
                <Ionicons name="chevron-forward" size={22} color={theme.colors.muted} />
              </Pressable>
              {i < arr.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        <AppText style={styles.section}>Alerts on this phone</AppText>
        <AlertSettings testID="child-alert-settings" />

        <Pressable
          style={styles.logout}
          onPress={signOut}
          testID="child-logout"
          accessibilityRole="button"
          accessibilityLabel="Log out of Sunshine"
        >
          <Ionicons name="log-out-outline" size={24} color={theme.colors.error} />
          <AppText style={styles.logoutText}>Log out</AppText>
        </Pressable>
      </ScrollView>

      {helpOpen && (
        <View style={styles.backdrop} testID="help-sheet">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setHelpOpen(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.handle} />
            <View style={styles.helpIcon}><GradientFill tone="brand" radius={36} /><Ionicons name="help-buoy" size={36} color="#fff" /></View>
            <AppText style={styles.sheetTitle}>We\u2019re here to help</AppText>
            <AppText style={styles.sheetSub}>
              Questions about a request, a payment or your parent\u2019s account? Our team answers within a day.
            </AppText>
            <GradientButton tone="brand"
              style={styles.helpBtn}
              onPress={() => Linking.openURL("mailto:help@sunshine.care?subject=Sunshine%20support").catch(() => {})}
              testID="help-email"
              accessibilityRole="button"
              accessibilityLabel="Email Sunshine support"
            >
              <Ionicons name="mail" size={22} color="#fff" />
              <AppText style={styles.helpBtnText}>  Email help@sunshine.care</AppText>
            </GradientButton>
            <Pressable style={styles.helpSecondary} onPress={() => setHelpOpen(false)} testID="help-close"
              accessibilityRole="button" accessibilityLabel="Close">
              <AppText style={styles.helpSecondaryText}>Close</AppText>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: { alignItems: "center", paddingTop: 16 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: theme.colors.brandLight, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  name: { fontSize: 26, fontWeight: "800", color: theme.colors.onSurface, marginTop: 12 },
  sub: { fontSize: 16, color: theme.colors.muted },
  linkCard: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 20, marginTop: 20, backgroundColor: theme.colors.brandLight, borderRadius: 20, padding: 18 },
  linkLabel: { fontSize: 14, color: theme.colors.brand, fontWeight: "700" },
  linkValue: { fontSize: 20, fontWeight: "800", color: theme.colors.onSurface },
  livePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.success },
  liveText: { fontSize: 13, fontWeight: "800", color: theme.colors.success },
  rows: { marginHorizontal: 20, marginTop: 24, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 20, paddingHorizontal: 16, borderWidth: 1, borderColor: theme.colors.border },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16 },
  rowIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.brandLight, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 17, fontWeight: "700", color: theme.colors.onSurface },
  rowSub: { fontSize: 14, color: theme.colors.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: theme.colors.border, marginLeft: 58 },
  section: { fontSize: 20, fontWeight: "800", color: theme.colors.onSurface, marginHorizontal: 20, marginTop: 28, marginBottom: 12 },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginHorizontal: 20, marginTop: 28, paddingVertical: 18, borderRadius: 999, borderWidth: 2, borderColor: theme.colors.error },
  logoutText: { fontSize: 18, fontWeight: "800", color: theme.colors.error },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, alignItems: "center", gap: 12 },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: theme.colors.borderStrong },
  helpIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center", marginTop: 4 },
  sheetTitle: { fontSize: theme.font.lg, fontWeight: "800", color: theme.colors.onSurface, textAlign: "center" },
  sheetSub: { fontSize: theme.font.base, color: theme.colors.onSurfaceSecondary, textAlign: "center", lineHeight: 24 },
  helpBtn: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.brand, borderRadius: theme.radius.pill, paddingVertical: 18, minHeight: 60 },
  helpBtnText: { color: "#fff", fontSize: theme.font.base, fontWeight: "800" },
  helpSecondary: { alignSelf: "stretch", backgroundColor: theme.colors.surfaceTertiary, borderRadius: theme.radius.pill, paddingVertical: 18, alignItems: "center", minHeight: 60 },
  helpSecondaryText: { color: theme.colors.onSurface, fontSize: theme.font.base, fontWeight: "700" },
});
