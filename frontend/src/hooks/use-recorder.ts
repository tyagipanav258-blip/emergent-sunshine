import { useCallback, useState } from "react";
import { Platform } from "react-native";
import { useAudioRecorder, AudioModule, RecordingPresets, setAudioModeAsync } from "expo-audio";
import { getToken } from "@/src/api";
import { API } from "@/src/theme";

export type RecorderError = "unsupported" | "permission" | "failed" | null;

/**
 * Shared microphone handling for the three places that record: asking Sunshine
 * something, answering a confirmation, and leaving a family voice note.
 */
export function useRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<RecorderError>(null);

  const start = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (Platform.OS === "web") {
      setError("unsupported");
      return false;
    }
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError("permission");
        return false;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      return true;
    } catch {
      setError("failed");
      return false;
    }
  }, [recorder]);

  /** Stops the recording and returns the file uri, or null if nothing was captured. */
  const stop = useCallback(async (): Promise<string | null> => {
    setRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      return recorder.uri ?? null;
    } catch {
      setError("failed");
      return null;
    }
  }, [recorder]);

  /** Uploads a recording as multipart form data to an authenticated endpoint. */
  const upload = useCallback(async (path: string, uri: string, extra?: Record<string, string>) => {
    const token = await getToken();
    const form = new FormData();
    const name = uri.split("/").pop() || "speech.m4a";
    form.append("file", { uri, name, type: "audio/m4a" } as any);
    for (const [k, v] of Object.entries(extra || {})) form.append(k, v);
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }, []);

  return { recording, error, setError, start, stop, upload };
}
