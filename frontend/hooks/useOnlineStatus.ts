"use client";
import { useEffect, useState } from "react";

// Tracks navigator.onLine (plan11 phase 2 step 4 — moved verbatim out of
// app/transfer/page.tsx). Starts true so SSR/first paint never flashes the
// offline banner.
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return isOnline;
}
