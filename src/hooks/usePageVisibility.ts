import { useEffect, useRef } from "react";

/** Calls `onHidden` whenever the page becomes hidden (tab switch, minimise). */
export function usePageHidden(onHidden: () => void): void {
  const ref = useRef(onHidden);
  ref.current = onHidden;
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "hidden") ref.current();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
}
