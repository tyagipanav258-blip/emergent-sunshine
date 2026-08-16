import { Tabs } from "expo-router";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import { AppText } from "@/src/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "@/src/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
const TABS: { name: string; label: string; icon: IconName; active: IconName; testID: string }[] = [
  { name: "index", label: "Dashboard", icon: "grid-outline", active: "grid", testID: "ctab-home" },
  { name: "tasks", label: "Tasks", icon: "checkbox-outline", active: "checkbox", testID: "ctab-tasks" },
  { name: "profile", label: "Profile", icon: "person-outline", active: "person", testID: "ctab-profile" },
];

export default function ChildLayout() {
  const insets = useSafeAreaInsets();
  const bottom = insets.bottom > 0 ? insets.bottom : 12;
  return (
    <Tabs
      screenOptions={{ headerShown: false, animation: "none" }}
      tabBar={({ state, navigation }) => (
        <View style={[styles.bar, { paddingBottom: bottom }]} testID="child-tabbar">
          {TABS.map((tab, index) => {
            const focused = state.index === index;
            return (
              <Pressable key={tab.name} testID={tab.testID} style={styles.item} hitSlop={8}
                onPress={() => { if (Platform.OS !== "web") Haptics.selectionAsync(); navigation.navigate(state.routes[index].name); }}>
                <Ionicons name={focused ? tab.active : tab.icon} size={28} color={focused ? theme.colors.brand : theme.colors.muted} />
                <AppText style={[styles.label, { color: focused ? theme.colors.brand : theme.colors.muted, fontWeight: focused ? "800" : "600" }]}>{tab.label}</AppText>
              </Pressable>
            );
          })}
        </View>
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="tasks" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", backgroundColor: theme.colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 10, paddingHorizontal: 6 },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, minHeight: 56 },
  label: { fontSize: 13 },
});
