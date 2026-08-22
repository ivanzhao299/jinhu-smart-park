"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

export function MobileTerminalReliability() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const updateNetworkState = () => setOnline(navigator.onLine);
    const updateViewport = () => {
      const viewport = window.visualViewport;
      document.documentElement.style.setProperty("--terminal-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
    };

    updateNetworkState();
    updateViewport();
    window.addEventListener("online", updateNetworkState);
    window.addEventListener("offline", updateNetworkState);
    window.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("resize", updateViewport);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }

    return () => {
      window.removeEventListener("online", updateNetworkState);
      window.removeEventListener("offline", updateNetworkState);
      window.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      document.documentElement.style.removeProperty("--terminal-viewport-height");
    };
  }, []);

  if (online) return null;

  return (
    <aside aria-live="assertive" className="mobile-terminal-network-state" role="status">
      <CloudOff size={18} />
      <span>网络已断开，已填写内容会保留在本机。</span>
      <button type="button" onClick={() => window.location.reload()}>
        <RefreshCw size={16} />
        重试
      </button>
    </aside>
  );
}
