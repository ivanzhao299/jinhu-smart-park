"use client";

import { Alert, Button, Form, Input } from "antd";
import { Activity, Building2, LockKeyhole, LogIn, ShieldCheck, UserRound, Waves } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { apiRequest } from "../../lib/api-client";
import { fetchCurrentUser, setSession, setToken } from "../../lib/auth";

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
      <div className="signin-background" aria-hidden="true" />
      <section className="signin-identity" aria-label="金湖科创产业园">
        <div className="signin-brand-row">
          <img alt="金湖科创产业园" src="/brand/jinhupark-logo.svg" />
        </div>
        <div className="signin-copy">
          <span className="signin-kicker">Smart Park Operation Cloud</span>
          <h1>让园区运营进入实时协同时代</h1>
          <p>资产、招商、合同、财务、安全巡检、IoT 设备与现场工单统一在线，构建金湖科创产业园数字运营中枢。</p>
          <div className="signin-capabilities" aria-label="平台能力">
            <span><Building2 size={16} /> 资产空间</span>
            <span><ShieldCheck size={16} /> 安全闭环</span>
            <span><Activity size={16} /> 设备态势</span>
            <span><Waves size={16} /> 能源监测</span>
          </div>
        </div>
      </section>

      <section className="signin-card" aria-label="登录">
        <div className="signin-card-header">
          <div>
            <span className="signin-card-eyebrow">Secure Access</span>
            <h2>进入运营控制台</h2>
            <p>使用平台账号登录，系统会自动匹配所属租户与默认园区。</p>
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
