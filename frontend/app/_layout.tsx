import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StatusBar, View, ActivityIndicator } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/auth";
import { theme } from "@/src/theme";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const seg0 = segments[0];
    const inAuth = seg0 === "(auth)";
    if (!user && !inAuth) {
      router.replace("/(auth)/role");
    } else if (user && (inAuth || seg0 === undefined)) {
      router.replace(user.role === "elder" ? "/(elder)" : "/(child)");
    } else if (user && seg0 === "(child)" && user.role === "elder") {
      router.replace("/(elder)");
    } else if (user && seg0 === "(elder)" && user.role === "child") {
      router.replace("/(child)");
    }
  }, [user, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface }}>
        <ActivityIndicator size="large" color={theme.colors.brand} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(elder)" />
      <Stack.Screen name="(child)" />
      <Stack.Screen name="call" options={{ presentation: "fullScreenModal", animation: "fade" }} />
      <Stack.Screen name="assistant" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <BottomSheetModalProvider>
            <StatusBar barStyle="dark-content" />
            <AuthProvider>
              <RootNavigator />
            </AuthProvider>
          </BottomSheetModalProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
