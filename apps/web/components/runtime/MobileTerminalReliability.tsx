"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ensurePropertyOfflineScope } from "../../features/property-shared/offline/property-draft-store";
import { useAuthUser } from "../../lib/auth-context";

export function MobileTerminalReliability() {
  const [online, setOnline] = useState(true);
  const pathname = usePathname();
  const user = useAuthUser();
  const module = pathname.split("/").filter(Boolean)[0] ?? "dashboard";

  useEffect(() => {
    if (!user) return;
    void ensurePropertyOfflineScope({
      tenantId: user.tenant_id,
      parkId: user.park_id,
      userId: user.id,
      module,
      permissionFingerprint: JSON.stringify([user.data_scope, ...user.permissions].sort())
    });
  }, [module, user]);

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
      <span>网络已断开，请勿刷新或关闭页面；恢复连接后再提交。</span>
      <button type="button" onClick={() => window.location.reload()}>
        <RefreshCw size={16} />
        重试
      </button>
    </aside>
  );
}
