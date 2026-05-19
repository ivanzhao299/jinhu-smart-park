"use client";

import { Alert, Button, Form, Input } from "antd";
import { Building2, LockKeyhole, LogIn, MapPinned, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const unsafeParams = ["tenantId", "parkId", "username", "password", "tenant_id", "park_id"];
    if (unsafeParams.some((param) => currentUrl.searchParams.has(param))) {
      window.history.replaceState(null, "", currentUrl.pathname);
    }
  }, []);

  async function handleSubmit(payload: LoginFormValues) {
    setLoading(true);
    setMessage("");

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
    <main className="signin-page">
      <section className="signin-identity" aria-label="金湖科创产业园">
        <div className="signin-brand-row">
          <span className="signin-symbol">
            <img alt="金湖科创产业园" src="/brand/jinhu-park-symbol.png" />
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
          <img alt="金湖科创产业园" src="/brand/jinhu-park-symbol.png" />
          <div>
            <h2>登录</h2>
            <p>使用租户身份进入管理后台</p>
          </div>
        </div>

        <Form<LoginFormValues> className="signin-form" layout="vertical" onFinish={handleSubmit}>
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
