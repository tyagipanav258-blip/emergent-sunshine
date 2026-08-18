import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { apiFetch } from "@/src/api";
import { theme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

/**
 * Push notifications.
 *
 * The inbox inside the app only reaches someone who has already opened it. An
 * SOS has to reach a phone that is face-down on a table, so the same
 * notifications the backend writes to the inbox are also delivered here.
 *
 * Everything in this file fails soft. A phone that cannot register for push
 * still gets every notification in the inbox; it just will not ring.
 */

const TOKEN_KEY = "sunshine_push_token";

export type PushStatus =
  | "ready"          // registered; this phone will ring
  | "denied"         // the person said no to notifications
  | "unsupported"    // web, or a simulator with no push service
  | "needs-build"    // Expo Go cannot receive remote push since SDK 53
  | "unconfigured"   // no EAS project id, so Expo cannot mint a token
  | "failed"         // something else went wrong
  | "idle";          // not attempted yet

export type PushState = { status: PushStatus; token: string | null; detail?: string };

/** Foreground behaviour: show the banner even while the app is open. */
export function installPushHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Android files notifications into channels, and the channel — not the message
 * — decides whether a phone on vibrate makes a sound. Emergencies get their own.
 */
async function ensureChannels() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Updates",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200, 120, 200],
    lightColor: theme.colors.brand,
  });
  await Notifications.setNotificationChannelAsync("urgent", {
    name: "Emergencies and missed medicines",
    description: "Alerts that should reach you straight away.",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 150, 400, 150, 400],
    lightColor: "#A8443C",
    bypassDnd: true,
    sound: "default",
  });
}

function projectId(): string | undefined {
  const c: any = Constants;
  return c?.expoConfig?.extra?.eas?.projectId || c?.easConfig?.projectId || undefined;
}

/**
 * Ask for permission, mint an Expo push token and hand it to the backend.
 *
 * Safe to call on every launch: the backend keys devices on the token, so
 * re-registering refreshes the row rather than piling up duplicates.
 */
export async function registerForPush(): Promise<PushState> {
  if (Platform.OS === "web" || !Device.isDevice) {
    return { status: "unsupported", token: null };
  }
  // Expo Go dropped remote push in SDK 53; a development build is required.
  if (Constants.appOwnership === "expo") {
    return { status: "needs-build", token: null };
  }

  try {
    await ensureChannels();

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const asked = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      granted = asked.granted;
    }
    if (!granted) return { status: "denied", token: null };

    const id = projectId();
    if (!id) {
      return {
        status: "unconfigured",
        token: null,
        detail: "This build has no EAS project id, so Expo cannot issue a push token.",
      };
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    if (!token) return { status: "failed", token: null };

    await apiFetch("/devices/register", {
      method: "POST",
      body: {
        token,
        platform: Platform.OS,
        device_name: [Device.manufacturer, Device.modelName].filter(Boolean).join(" ").slice(0, 80),
      },
    });
    await storage.setItem(TOKEN_KEY, token);
    return { status: "ready", token };
  } catch (e: any) {
    return { status: "failed", token: null, detail: String(e?.message || e) };
  }
}

/**
 * Release this phone on sign-out, so the next person to use it does not receive
 * someone else's medicine reminders.
 */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await storage.getItem<string>(TOKEN_KEY, "");
    if (token) await apiFetch("/devices/unregister", { method: "POST", body: { token } });
  } catch {
    // Signing out must never be blocked by the network. The backend also drops
    // the device the first time Expo reports the token as unregistered.
  }
  await storage.removeItem(TOKEN_KEY);
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // Badges are unavailable on some Android launchers.
  }
}

/** Ask the backend to send this phone a test alert. */
export async function sendTestPush(): Promise<{ ok: boolean; sent: number }> {
  return apiFetch("/devices/test", { method: "POST" });
}

/** Keep the app icon badge in step with the unread count. */
export async function setBadge(count: number): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    // Not supported everywhere; the in-app badge still shows the count.
  }
}

/** Where a tapped notification should take you. */
export function routeForKind(kind: string, role: "elder" | "child"): string {
  if (role === "child") {
    if (kind === "invoice") return "/(child)";
    if (kind === "task_assigned" || kind === "task_update") return "/(child)/tasks";
    return "/notifications";
  }
  if (kind === "missed_dose") return "/(elder)/health";
  if (kind === "photo" || kind === "voice_note") return "/notifications";
  return "/notifications";
}
