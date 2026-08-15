import { Tabs } from "expo-router";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { theme } from "@/src/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TABS: { name: string; label: string; icon: IconName; iconActive: IconName; testID: string }[] = [
  { name: "index", label: "Home", icon: "home-outline", iconActive: "home", testID: "tab-home" },
  { name: "news", label: "News", icon: "newspaper-outline", iconActive: "newspaper", testID: "tab-news" },
  { name: "health", label: "Health", icon: "heart-outline", iconActive: "heart", testID: "tab-health" },
  { name: "profile", label: "Profile", icon: "person-outline", iconActive: "person", testID: "tab-profile" },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
        animation: "none",
      }}
      tabBar={(props) => {
        const { state, navigation } = props;
        return (
          <View style={styles.bar} testID="bottom-nav">
            {TABS.map((tab, index) => {
              const focused = state.index === index;
              return (
                <Pressable
                  key={tab.name}
                  testID={tab.testID}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.selectionAsync();
                    const route = state.routes[index];
                    navigation.navigate(route.name as never);
                  }}
                  style={styles.item}
                  hitSlop={12}
                >
                  <Ionicons
                    name={focused ? tab.iconActive : tab.icon}
                    size={28}
                    color={focused ? theme.colors.brand : theme.colors.muted}
                  />
                  <Text style={[styles.label, { color: focused ? theme.colors.brand : theme.colors.muted, fontWeight: focused ? "700" : "500" }]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </View>
        );
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="news" />
      <Tabs.Screen name="health" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 10,
    paddingBottom: 22,
    paddingHorizontal: 8,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 56,
  },
  label: {
    fontSize: 13,
  },
});
