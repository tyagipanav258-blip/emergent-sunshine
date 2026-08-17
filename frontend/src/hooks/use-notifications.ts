import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { apiFetch } from "@/src/api";
import { setBadge } from "@/src/push";

export type Notification = {
  id: string;
  kind: string;
  title?: string;
  message: string;
  data?: Record<string, any>;
  at: string;
  read: boolean;
};

/** The shared inbox both sides read from. Refreshes whenever a screen regains focus. */
export function useNotifications() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ items: Notification[]; unread: number }>("/notifications");
      setItems(r.items || []);
      setUnread(r.unread || 0);
    } catch {
      // Leave whatever we had; the badge simply won't move.
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // The number on the app icon should mean the same thing as the one in the app.
  useEffect(() => { setBadge(unread); }, [unread]);

  const markRead = useCallback(async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(u - 1, 0));
    try {
      await apiFetch(`/notifications/${id}/read`, { method: "POST" });
    } catch {
      load();
    }
  }, [load]);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try {
      await apiFetch("/notifications/read-all", { method: "POST" });
    } catch {
      load();
    }
  }, [load]);

  return { items, unread, loading, load, markRead, markAllRead };
}

/** Icon and tone for each kind of notification, so both inboxes look the same. */
export const NOTIFICATION_STYLE: Record<string, { icon: any; tone: "urgent" | "warm" | "neutral" }> = {
  sos: { icon: "alert-circle", tone: "urgent" },
  missed_dose: { icon: "alarm", tone: "urgent" },
  invoice: { icon: "card", tone: "warm" },
  task_assigned: { icon: "clipboard", tone: "warm" },
  task_update: { icon: "checkmark-circle", tone: "neutral" },
  photo: { icon: "image", tone: "warm" },
  voice_note: { icon: "mic", tone: "warm" },
  im_okay: { icon: "sunny", tone: "neutral" },
  family_joined: { icon: "person-add", tone: "neutral" },
};
