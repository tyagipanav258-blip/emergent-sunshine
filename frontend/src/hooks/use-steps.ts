import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { Pedometer } from "expo-sensors";
import { apiFetch } from "@/src/api";

export type StepDay = { day: string; steps: number };

export type StepWeek = {
  today: number;
  goal: number;
  series: StepDay[];
  total: number;
  average: number;
  best_day: StepDay | null;
  days_active: number;
  goal_days: number;
};

/** Local calendar day, matching how the backend keys a day for this elder. */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Today's step count from the phone, plus the week's history from the server.
 *
 * iOS can be asked for a historical count directly. Android's pedometer only
 * counts forward from when you start watching, which is why each day's total is
 * synced to the backend — the week then survives an app restart, and the family
 * can see it too.
 */
export function useSteps() {
  const [today, setToday] = useState(0);
  const [week, setWeek] = useState<StepWeek | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  // Steps counted live on Android are added to whatever the day already had.
  const baseline = useRef(0);

  const loadWeek = useCallback(async () => {
    try {
      const w = await apiFetch<StepWeek>("/health/steps?days=7");
      setWeek(w);
      return w;
    } catch {
      return null;
    }
  }, []);

  const sync = useCallback(async (steps: number) => {
    if (steps <= 0) return;
    try {
      await apiFetch("/health/steps", { method: "POST", body: { day: todayKey(), steps, source: "pedometer" } });
    } catch {
      // A missed sync is recoverable — the next one sends the running total.
    }
  }, []);

  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    let cancelled = false;

    (async () => {
      const w = await loadWeek();
      if (!cancelled && w) {
        baseline.current = w.today;
        setToday(w.today);
      }

      if (Platform.OS === "web") {
        setAvailable(false);
        setLoading(false);
        return;
      }

      try {
        const ok = await Pedometer.isAvailableAsync();
        if (cancelled) return;
        setAvailable(ok);
        if (!ok) {
          setLoading(false);
          return;
        }

        const perm = await Pedometer.requestPermissionsAsync();
        if (cancelled) return;
        if (!perm.granted) {
          setDenied(true);
          setLoading(false);
          return;
        }

        // iOS can report the whole day retroactively.
        try {
          const res = await Pedometer.getStepCountAsync(startOfToday(), new Date());
          if (!cancelled && res && typeof res.steps === "number" && res.steps > 0) {
            baseline.current = res.steps;
            setToday(res.steps);
            await sync(res.steps);
          }
        } catch {
          // Android throws here; the live watcher below covers it.
        }

        sub = Pedometer.watchStepCount((r) => {
          const total = baseline.current + r.steps;
          setToday(total);
        });
      } catch {
        if (!cancelled) setAvailable(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [loadWeek, sync]);

  // Push the running total up periodically rather than on every single step.
  useEffect(() => {
    if (today <= 0) return;
    const t = setTimeout(() => sync(today), 20000);
    return () => clearTimeout(t);
  }, [today, sync]);

  const refresh = useCallback(async () => {
    await sync(today);
    await loadWeek();
  }, [today, sync, loadWeek]);

  return { today, week, available, denied, loading, refresh };
}
