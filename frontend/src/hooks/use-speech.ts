import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioPlayer } from "expo-audio";
import { apiFetch } from "@/src/api";
import { API } from "@/src/theme";
import { storage } from "@/src/utils/storage";

const KEY = "sunshine_speak_replies";

type SpeakResponse = { id: string; url: string; token: string };

/**
 * Reads Sunshine's replies aloud so the assistant can be used without looking
 * at the screen. The preference is remembered between sessions.
 */
export function useSpeech() {
  const player = useAudioPlayer();
  const [enabled, setEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  // Guards against a slow reply speaking over a newer one.
  const latest = useRef(0);

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string>(KEY, "on");
      setEnabled(saved !== "off");
    })();
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      storage.setItem(KEY, next ? "on" : "off");
      if (!next) {
        try {
          player.pause();
        } catch {
          // Nothing was playing.
        }
        setSpeaking(false);
      }
      return next;
    });
  }, [player]);

  const stop = useCallback(() => {
    latest.current += 1;
    try {
      player.pause();
    } catch {
      // Nothing was playing.
    }
    setSpeaking(false);
  }, [player]);

  const speak = useCallback(
    async (text: string) => {
      if (!enabled || !text?.trim()) return;
      const ticket = ++latest.current;
      setSpeaking(true);
      try {
        const res = await apiFetch<SpeakResponse>("/agent/speak", { method: "POST", body: { text } });
        if (ticket !== latest.current) return; // a newer reply already took over
        const base = API.replace(/\/api$/, "");
        player.replace({ uri: `${base}${res.url}?token=${encodeURIComponent(res.token)}` });
        player.play();
      } catch {
        // Speech is an enhancement — the reply is already on screen.
      } finally {
        if (ticket === latest.current) setSpeaking(false);
      }
    },
    [enabled, player]
  );

  return { enabled, toggle, speak, stop, speaking };
}
