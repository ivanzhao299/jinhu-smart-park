"use client";

import { LogOut, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuthUser } from "../../lib/auth-context";
import { apiRequest, createIdempotencyKey } from "../../lib/api-client";
import { clearSession, getToken } from "../../lib/auth";

export function UserMenu() {
  const router = useRouter();
  const user = useAuthUser();

  async function logout() {
    try {
      await apiRequest<{ userId: string }>("/auth/logout", {
        method: "POST",
        token: getToken(),
        idempotencyKey: createIdempotencyKey("logout")
      });
    } finally {
      clearSession();
      router.replace("/login");
    }
  }

  return (
    <div className="user-menu">
      <span className="user-avatar"><UserRound size={16} /></span>
      <span>{user?.real_name ?? user?.username ?? "未登录"}</span>
      <button aria-label="退出登录" title="退出登录" type="button" onClick={() => void logout()}>
        <LogOut size={16} />
      </button>
    </div>
  );
}
