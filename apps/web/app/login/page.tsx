"use client";

import type { Route } from "next";
import { Alert, Button, Form, Input } from "antd";
import { Building2, FileText, LockKeyhole, LogIn, PlugZap, ShieldCheck, Store, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useAppBranding } from "../../components/branding/useAppBranding";
import { apiRequest } from "../../lib/api-client";
import { fetchCurrentUser, setSession, setToken } from "../../lib/auth";
import { resolvePostLoginPath } from "../../lib/post-login-route";

interface LoginResult {
  accessToken?: string;
  refreshToken?: string;
  tokenType?: "Bearer";
  expiresIn?: string;
  requiresContextSelection?: boolean;
  user?: {
    id: string;
    username: string;
    tenantId: string;
    parkId: string;
    roles: string[];
    permissions: string[];
  };
}

interface LoginFormValues {
  username: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const branding = useAppBranding();
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const completeLogin = useCallback(
    async (result: LoginResult) => {
      if (!result.accessToken) {
        if (result.requiresContextSelection) {
          throw new Error("该账号关联多个园区，请联系管理员设置默认登录园区");
        }
        throw new Error("登录响应缺少访问令牌");
      }
      setToken(result.accessToken);
      const currentUser = await fetchCurrentUser();
      setSession(result.accessToken, currentUser, result.refreshToken);
      setMessage(`登录成功，欢迎 ${result.user?.username ?? currentUser.username}`);
      router.replace(resolvePostLoginPath(currentUser) as Route);
    },
    [router]
  );

  async function handlePasswordSubmit(payload: LoginFormValues) {
    setLoading(true);
    setMessage("");

    try {
      const response = await apiRequest<LoginResult>("/auth/login", {
        method: "POST",
        body: payload
      });
      await completeLogin(response.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }


  return (
    <main className="signin-page">
      <div className="signin-background" aria-hidden="true" />
      <section className="signin-identity" aria-label={branding.logoAlt}>
        <div className="signin-brand-row">
          <img alt="" aria-hidden="true" src="/brand/jinhupark-symbol.svg" />
          <strong>{branding.shortName}</strong>
        </div>
        <div className="signin-copy">
          <h1>{branding.systemName}</h1>
          <div className="signin-capabilities" aria-label="平台能力">
            <span><Building2 size={16} /> 资产运营</span>
            <span><Store size={16} /> 招商租赁</span>
            <span><FileText size={16} /> 财务合同</span>
            <span><ShieldCheck size={16} /> 现场安全</span>
            <span><PlugZap size={16} /> 设备能源</span>
          </div>
        </div>
      </section>

      <section className="signin-card" aria-label="登录">
        <div className="signin-card-header">
          <div>
            <span className="signin-card-eyebrow">Secure Access</span>
            <h2>进入运营控制台</h2>
            <p>使用平台账号登录。</p>
          </div>
        </div>
        <Form<LoginFormValues> className="signin-form" layout="vertical" onFinish={handlePasswordSubmit}>
          <Form.Item label="账号" name="username" rules={[{ required: true, message: "请输入账号" }]}>
            <Input autoComplete="username" placeholder="请输入账号" prefix={<UserRound size={16} />} size="large" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password autoComplete="current-password" placeholder="请输入密码" prefix={<LockKeyhole size={16} />} size="large" />
          </Form.Item>

          <Button block className="signin-submit" htmlType="submit" icon={<LogIn size={17} />} loading={loading} size="large" type="primary">
            登录
          </Button>
          {message ? <Alert className="signin-alert" message={message} showIcon type="warning" /> : null}
        </Form>
      </section>
    </main>
  );
}
