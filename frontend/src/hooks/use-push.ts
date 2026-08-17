import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { installPushHandler, registerForPush, routeForKind, PushState } from "@/src/push";

installPushHandler();

/**
 * Registers this phone for alerts once someone is signed in, and handles what
 * happens when one arrives.
 *
 * Mounted from both role layouts, so it runs for whichever app is open. The
 * returned state is what the profile screen reports back to the user — nothing
 * here throws, and a phone that cannot register simply says so.
 */
export function usePush(onNotification?: () => void) {
  const { user } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<PushState>({ status: "idle", token: null });
  // Registration is per sign-in, not per render.
  const registeredFor = useRef<string | null>(null);
  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;

  const register = useCallback(async () => {
    const s = await registerForPush();
    setState(s);
    return s;
  }, []);

  useEffect(() => {
    if (!user) {
      registeredFor.current = null;
      return;
    }
    if (registeredFor.current === user.id) return;
    registeredFor.current = user.id;
    register();
  }, [user, register]);

  useEffect(() => {
    if (Platform.OS === "web" || !user) return;

    // Arrived while the app is open: refresh the inbox behind the banner.
    const received = Notifications.addNotificationReceivedListener(() => {
      onNotificationRef.current?.();
    });

    // Tapped, from the tray or the lock screen: open the screen it is about.
    const responded = Notifications.addNotificationResponseReceivedListener((res) => {
      const data: any = res.notification.request.content.data || {};
      const path = routeForKind(String(data.kind || ""), user.role);
      router.push(path as any);
    });

    return () => {
      received.remove();
      responded.remove();
    };
  }, [user, router]);

  return { ...state, register };
}
