import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";

export default function ChildProfile() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="child-profile">
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.avatar}><Ionicons name="person" size={44} color={theme.colors.brand} /></View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.sub}>{user?.email}</Text>
        </View>

        <View style={styles.linkCard} testID="linked-parent">
          <Ionicons name="link" size={26} color={theme.colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={styles.linkLabel}>Connected to</Text>
            <Text style={styles.linkValue}>{user?.elder_name || "Your parent"}</Text>
          </View>
          <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>Linked</Text></View>
        </View>

        <View style={styles.rows}>
          {[
            { icon: "notifications", label: "Alerts & notifications", sub: "SOS, low medicine, missed doses" },
            { icon: "shield-checkmark", label: "Privacy & consent", sub: "What you can see about your parent" },
            { icon: "document-text", label: "Doctor reports", sub: "Shared reports & prescriptions" },
            { icon: "help-circle", label: "Help & support", sub: "We're here to help" },
          ].map((r, i, arr) => (
            <View key={r.label}>
              <Pressable style={styles.row} testID={`crow-${r.label}`}>
                <View style={styles.rowIcon}><Ionicons name={r.icon as any} size={22} color={theme.colors.brand} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{r.label}</Text>
                  <Text style={styles.rowSub}>{r.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={theme.colors.muted} />
              </Pressable>
              {i < arr.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        <Pressable style={styles.logout} onPress={signOut} testID="child-logout">
          <Ionicons name="log-out-outline" size={24} color={theme.colors.error} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: { alignItems: "center", paddingTop: 16 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: theme.colors.brandLight, alignItems: "center", justifyContent: "center" },
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
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginHorizontal: 20, marginTop: 28, paddingVertical: 18, borderRadius: 999, borderWidth: 2, borderColor: theme.colors.error },
  logoutText: { fontSize: 18, fontWeight: "800", color: theme.colors.error },
});
