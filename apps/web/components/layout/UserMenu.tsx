"use client";

import { LogOut, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuthUser } from "../../lib/auth-context";
import { logoutSession } from "../../lib/auth";

interface UserMenuProps {
  compact?: boolean;
}

export function UserMenu({ compact = false }: UserMenuProps) {
  const router = useRouter();
  const user = useAuthUser();
  const displayName = user?.real_name ?? user?.username ?? "未登录";

  async function logout() {
    try {
      await logoutSession();
    } finally {
      router.replace("/login");
    }
  }

  return (
    <div className={`user-menu${compact ? " user-menu-compact" : ""}`}>
      <span aria-label={`当前账号：${displayName}`} className="user-avatar user-profile-trigger" role="img" title={displayName}>
        <UserRound size={16} />
      </span>
      {compact ? null : <span className="user-menu-name">{displayName}</span>}
      <button className="user-logout-button" aria-label="退出登录" title="退出登录" type="button" onClick={() => void logout()}>
        <LogOut size={15} />
        <span>退出</span>
      </button>
    </div>
  );
}
