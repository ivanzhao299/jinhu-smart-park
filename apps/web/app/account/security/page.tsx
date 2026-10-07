"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { clearSession } from "../../../lib/auth";
import { getAccessToken } from "../../../lib/authz";
import { useAuthUser } from "../../../lib/auth-context";
import styles from "./security.module.css";

export default function AccountSecurityPage() {
  const router = useRouter();
  const user = useAuthUser();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const changePassword = async (form: FormData) => {
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (newPassword !== confirmation) {
      setMessage("两次输入的新密码不一致");
      return;
    }
    if (currentPassword === newPassword) {
      setMessage("新密码不能与当前密码相同");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await apiRequest<{ userId: string; reauthenticate: true }>("/auth/password/change", {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("password-change"),
        body: { currentPassword, newPassword },
        skipUnauthorizedReset: true
      });
      await clearSession();
      router.replace("/login");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "密码修改失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="content ds-page">
      <section className="ds-hero">
        <div className="ds-hero-copy">
          <span className="ds-eyebrow">账号安全</span>
          <h1>修改登录密码</h1>
          <p>验证当前密码后更新登录凭据。成功后所有园区和设备会话立即失效，需要重新登录。</p>
        </div>
      </section>
      {user ? <section className="ds-panel" aria-labelledby="current-account-heading">
        <h2 id="current-account-heading">当前登录账号</h2>
        <div className="ds-mobile-record-list">
          <article className="ds-mobile-record"><strong>姓名与账号名</strong><span>{user.real_name} · {user.username}</span></article>
          <article className="ds-mobile-record"><strong>当前园区</strong><span>{user.current_park?.park_name ?? user.park_name ?? user.park_id}</span></article>
          <article className="ds-mobile-record"><strong>当前角色</strong><span>{user.roles.map(role => role.role_name).join("、") || "未配置角色"}</span></article>
        </div>
      </section> : null}
      <section className="ds-panel">
        <form className={styles.form} action={changePassword}>
          <label className="form-field"><span>当前密码</span><input name="currentPassword" type="password" minLength={6} maxLength={64} autoComplete="current-password" required /></label>
          <label className="form-field"><span>新密码</span><input name="newPassword" type="password" minLength={8} maxLength={64} autoComplete="new-password" required /></label>
          <label className="form-field"><span>确认新密码</span><input name="confirmation" type="password" minLength={8} maxLength={64} autoComplete="new-password" required /></label>
          {message ? <p className="form-error" role="alert">{message}</p> : null}
          <button className="ds-button ds-button-primary" disabled={busy}>{busy ? "正在修改" : "修改密码并退出全部设备"}</button>
        </form>
      </section>
    </main>
  );
}
