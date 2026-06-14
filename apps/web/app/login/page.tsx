"use client";

import { Alert, Button, Form, Input } from "antd";
import { Building2, LockKeyhole, LogIn, MapPinned, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { apiRequest } from "../../lib/api-client";
import { fetchCurrentUser, setSession, setToken } from "../../lib/auth";

interface LoginResult {
  accessToken?: string;
  refreshToken?: string;
  tokenType?: "Bearer";
  expiresIn?: string;
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
  tenantId: string;
  parkId: string;
  username: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const completeLogin = useCallback(
    async (result: LoginResult) => {
      if (!result.accessToken) {
        throw new Error("登录响应缺少访问令牌");
      }
      setToken(result.accessToken);
      const currentUser = await fetchCurrentUser();
      setSession(result.accessToken, currentUser, result.refreshToken);
      setMessage(`登录成功，欢迎 ${result.user?.username ?? currentUser.username}`);
      router.replace("/dashboard");
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
      <section className="signin-identity" aria-label="金湖科创产业园">
        <div className="signin-brand-row">
          <span className="signin-symbol">
            <img alt="金湖科创产业园" src="/brand/jinhupark-logo.svg" />
          </span>
          <span>金湖科创产业园</span>
        </div>
        <div className="signin-copy">
          <h1>数字运营平台</h1>
          <span>资产、招商、合同、财务和运营协同管理</span>
        </div>
      </section>

      <section className="signin-card" aria-label="登录">
        <div className="signin-card-header">
          <img alt="金湖科创产业园" src="/brand/jinhupark-logo.svg" />
          <div>
            <h2>登录</h2>
            <p>首发阶段仅支持账号密码登录</p>
          </div>
        </div>
        <Form<LoginFormValues> className="signin-form" layout="vertical" onFinish={handlePasswordSubmit}>
          <div className="signin-scope-grid">
            <Form.Item label="租户 ID" name="tenantId" rules={[{ required: true, message: "请输入租户 ID" }]}>
              <Input autoComplete="organization" placeholder="tenant_id" prefix={<Building2 size={16} />} size="large" />
            </Form.Item>
            <Form.Item label="园区 ID" name="parkId" rules={[{ required: true, message: "请输入园区 ID" }]}>
              <Input autoComplete="off" placeholder="park_id" prefix={<MapPinned size={16} />} size="large" />
            </Form.Item>
          </div>
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
