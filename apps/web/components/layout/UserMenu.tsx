"use client";

import { LogOut, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuthUser } from "../../lib/auth-context";
import { logoutSession } from "../../lib/auth";

export function UserMenu() {
  const router = useRouter();
  const user = useAuthUser();

  async function logout() {
    try {
      await logoutSession();
    } finally {
      router.replace("/login");
    }
  }

  return (
    <div className="user-menu">
      <span className="user-avatar"><UserRound size={16} /></span>
      <span className="user-menu-name">{user?.real_name ?? user?.username ?? "未登录"}</span>
      <button className="user-logout-button" aria-label="退出登录" title="退出登录" type="button" onClick={() => void logout()}>
        <LogOut size={15} />
        <span>退出</span>
      </button>
    </div>
  );
}
