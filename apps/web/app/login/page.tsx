"use client";

import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { apiRequest } from "../../lib/api-client";
import { fetchCurrentUser, setSession, setToken } from "../../lib/auth";

interface LoginResult {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  user: {
    id: string;
    username: string;
    tenantId: string;
    parkId: string;
    roles: string[];
    permissions: string[];
  };
}

export default function LoginPage() {
  const router = useRouter();
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      tenantId: String(formData.get("tenantId") ?? ""),
      parkId: String(formData.get("parkId") ?? ""),
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? "")
    };

    try {
      const response = await apiRequest<LoginResult>("/auth/login", {
        method: "POST",
        body: payload
      });
      setToken(response.data.accessToken);
      const currentUser = await fetchCurrentUser();
      setSession(response.data.accessToken, currentUser);
      setMessage(`登录成功，欢迎 ${response.data.user.username}`);
      router.replace("/dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <h1>产业园数字运营 SaaS 平台</h1>
        <p>使用租户统一身份登录管理后台</p>
        <form className="form-stack" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="tenantId">租户 ID</label>
            <input id="tenantId" name="tenantId" placeholder="请输入 tenant_id" type="text" />
          </div>
          <div className="field">
            <label htmlFor="parkId">园区 ID</label>
            <input id="parkId" name="parkId" placeholder="请输入 park_id" type="text" />
          </div>
          <div className="field">
            <label htmlFor="username">账号</label>
            <input id="username" name="username" placeholder="请输入账号" type="text" />
          </div>
          <div className="field">
            <label htmlFor="password">密码</label>
            <input id="password" name="password" placeholder="请输入密码" type="password" />
          </div>
          <button className="primary-button" disabled={loading} type="submit">
            <LogIn size={16} />
            {loading ? "登录中" : "登录"}
          </button>
          {message ? <span className="status-pill">{message}</span> : null}
        </form>
      </section>
    </main>
  );
}
