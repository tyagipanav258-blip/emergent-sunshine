import { View, ActivityIndicator } from "react-native";
import { theme } from "@/src/theme";

export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface }}>
      <ActivityIndicator size="large" color={theme.colors.brand} />
    </View>
  );
}
