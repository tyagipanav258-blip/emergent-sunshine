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
import { FeatureProvider, useFeatures, landingRoute } from "@/src/features";
import { TextScaleProvider } from "@/src/text-scale";
import { theme } from "@/src/theme";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { user, loading } = useAuth();
  const { features, loading: featuresLoading } = useFeatures();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Settings decide both whether an elder still owes us onboarding and which
    // tab their app opens on, so routing waits for them rather than flashing
    // Home first and correcting itself a moment later.
    if (loading || featuresLoading) return;
    const seg0 = segments[0];
    // `join` is the invite deep link; a signed-out visitor must reach it with
    // the family code intact rather than being bounced to the role picker.
    const inAuth = seg0 === "(auth)" || seg0 === "join";
    const inOnboarding = seg0 === "(onboarding)";
    const needsOnboarding = user?.role === "elder" && !features.onboarding_complete;

    if (!user && !inAuth) {
      router.replace("/(auth)/role");
    } else if (user && needsOnboarding && !inOnboarding) {
      router.replace("/(onboarding)/features");
    } else if (user && !needsOnboarding && inOnboarding) {
      // Finished (or a family account that never had onboarding to do).
      router.replace(user.role === "elder" ? (landingRoute(features) as any) : "/(child)");
    } else if (user && (inAuth || seg0 === undefined)) {
      // The elder's chosen tab opens first; `landingRoute` falls back to Home if
      // that tab has since been switched off.
      router.replace(user.role === "elder" ? (landingRoute(features) as any) : "/(child)");
    } else if (user && seg0 === "(child)" && user.role === "elder") {
      router.replace("/(elder)");
    } else if (user && seg0 === "(elder)" && user.role === "child") {
      router.replace("/(child)");
    }
  }, [user, loading, features, featuresLoading, segments, router]);

  if (loading || featuresLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface }}>
        <ActivityIndicator size="large" color={theme.colors.brand} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="join" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(elder)" />
      <Stack.Screen name="(child)" />
      <Stack.Screen name="call" options={{ presentation: "fullScreenModal", animation: "fade" }} />
      <Stack.Screen name="assistant" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      <Stack.Screen name="notifications" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      <Stack.Screen name="my-app-settings" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="manage-app" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="family/[id]" options={{ animation: "slide_from_right" }} />
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
            <TextScaleProvider>
              <AuthProvider>
                <FeatureProvider>
                  <RootNavigator />
                </FeatureProvider>
              </AuthProvider>
            </TextScaleProvider>
          </BottomSheetModalProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
