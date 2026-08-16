import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { storage } from "@/src/utils/storage";
import { TEXT_SCALES, TextScaleKey, scaleFont, FontStep } from "@/src/theme";

const KEY = "sunshine_text_scale";

type TextScaleState = {
  /** Which step the user chose in Profile > Accessibility. */
  key: TextScaleKey;
  /** Multiplier to apply to any size from the type scale. */
  scale: number;
  setScale: (key: TextScaleKey) => void;
  /** Resolve a named step from the type scale at the user's chosen size. */
  f: (step: FontStep) => number;
};

const TextScaleContext = createContext<TextScaleState>({
  key: "normal",
  scale: 1,
  setScale: () => {},
  f: (step) => scaleFont(step, 1),
});

export const useTextScale = () => useContext(TextScaleContext);

export function TextScaleProvider({ children }: { children: React.ReactNode }) {
  const [key, setKey] = useState<TextScaleKey>("normal");

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string>(KEY, "normal");
      if (saved && saved in TEXT_SCALES) setKey(saved as TextScaleKey);
    })();
  }, []);

  const setScale = useCallback((next: TextScaleKey) => {
    setKey(next);
    storage.setItem(KEY, next);
  }, []);

  const value = useMemo<TextScaleState>(() => {
    const scale = TEXT_SCALES[key];
    return { key, scale, setScale, f: (step: FontStep) => scaleFont(step, scale) };
  }, [key, setScale]);

  return <TextScaleContext.Provider value={value}>{children}</TextScaleContext.Provider>;
}
