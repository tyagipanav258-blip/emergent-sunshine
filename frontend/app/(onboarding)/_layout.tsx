import { Stack } from "expo-router";

/**
 * First run, straight after elder signup. Two questions, then the app.
 *
 * Gestures are off and there is no header: the only ways out are the buttons on
 * the screens themselves, so an elder cannot swipe halfway into an app that has
 * not been set up yet.
 */
export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false, animation: "slide_from_right" }} />;
}
