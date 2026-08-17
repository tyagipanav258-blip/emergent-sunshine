import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { NativeSyntheticEvent, NativeScrollEvent } from "react-native";

type ScrollState = {
  /** False while scrolling down, or while a screen has an overlay open. */
  chromeVisible: boolean;
  /** Attach to any ScrollView/FlatList that the floating buttons sit over. */
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Screens call this while a sheet is open so the buttons don't sit on top of it. */
  setChromeSuppressed: (suppressed: boolean) => void;
};

const ScrollContext = createContext<ScrollState>({
  chromeVisible: true, onScroll: () => {}, setChromeSuppressed: () => {},
});

export const useScrollChrome = () => useContext(ScrollContext);

/**
 * Keeps the floating buttons out of the way while someone is reading.
 *
 * They sit in the bottom corners, which means they inevitably cover part of a
 * full-width card. Rather than accept that, they fade out as soon as the user
 * scrolls down and come straight back when scrolling stops or reverses — so
 * they are always there when wanted and never on top of what is being read.
 */
export function ScrollChromeProvider({ children }: { children: React.ReactNode }) {
  const [scrolledAway, setScrolledAway] = useState(false);
  const [suppressed, setChromeSuppressed] = useState(false);
  const lastY = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const goingDown = y > lastY.current + 4;
    const goingUp = y < lastY.current - 4;
    lastY.current = y;

    if (goingDown && y > 40) setScrolledAway(true);
    else if (goingUp) setScrolledAway(false);

    // Back within a moment of stopping, so they are never gone for long.
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setScrolledAway(false), 700);
  }, []);

  const chromeVisible = !scrolledAway && !suppressed;
  const value = useMemo(
    () => ({ chromeVisible, onScroll, setChromeSuppressed }),
    [chromeVisible, onScroll],
  );
  return <ScrollContext.Provider value={value}>{children}</ScrollContext.Provider>;
}
