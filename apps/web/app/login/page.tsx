"use client";

import { Alert, Button, Form, Input, Segmented } from "antd";
import { Building2, LockKeyhole, LogIn, MapPinned, Phone, QrCode, ShieldCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
  requiresContextSelection?: boolean;
  requiresIdentityBinding?: boolean;
  loginTicket?: string;
  bindTicket?: string;
  contexts?: Array<{
    userId: string;
    username: string;
    realName: string;
    tenantId: string;
    parkId: string;
  }>;
}

interface MobileCodeResult {
  mobile: string;
  expiresIn: number;
  message: string;
  mockCode?: string;
}

interface WechatAuthorizeResult {
  provider: "wechat_open";
  state: string;
  authorizationUrl: string;
  expiresIn: number;
  mock: boolean;
  message?: string;
}

interface LoginFormValues {
  tenantId: string;
  parkId: string;
  username: string;
  password: string;
}

interface MobileLoginValues {
  tenantId: string;
  parkId: string;
  mobile: string;
  code: string;
}

interface WechatLoginValues {
  tenantId: string;
  parkId: string;
}

type LoginMode = "password" | "mobile" | "wechat";

export default function LoginPage() {
  const router = useRouter();
  const [mobileForm] = Form.useForm<MobileLoginValues>();
  const [wechatForm] = Form.useForm<WechatLoginValues>();
  const [mode, setMode] = useState<LoginMode>("password");
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [codeSending, setCodeSending] = useState(false);

  const completeLogin = useCallback(
    async (result: LoginResult) => {
      if (result.requiresIdentityBinding) {
        setMessage("该微信尚未绑定平台账号。请先使用账号或手机号登录，再在账户中心绑定微信。");
        return;
      }
      if (result.requiresContextSelection) {
        setMessage("该身份绑定了多个登录上下文，请填写园区 ID 后重新登录。");
        return;
      }
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

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const oauthCode = currentUrl.searchParams.get("code");
    const oauthState = currentUrl.searchParams.get("state");
    if (oauthCode && oauthState) {
      setMode("wechat");
      setLoading(true);
      apiRequest<LoginResult>("/auth/wechat/callback", {
        method: "POST",
        body: { code: oauthCode, state: oauthState }
      })
        .then((response) => completeLogin(response.data))
        .catch((error: unknown) => {
          setMessage(error instanceof Error ? error.message : "微信登录失败");
        })
        .finally(() => {
          window.history.replaceState(null, "", currentUrl.pathname);
          setLoading(false);
        });
      return;
    }

    const unsafeParams = ["tenantId", "parkId", "username", "password", "mobile", "code", "tenant_id", "park_id"];
    if (unsafeParams.some((param) => currentUrl.searchParams.has(param))) {
      window.history.replaceState(null, "", currentUrl.pathname);
    }
  }, [completeLogin]);

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

  async function sendMobileCode() {
    setCodeSending(true);
    setMessage("");
    try {
      const values = await mobileForm.validateFields(["tenantId", "parkId", "mobile"]);
      const response = await apiRequest<MobileCodeResult>("/auth/mobile/send-code", {
        method: "POST",
        body: { tenantId: values.tenantId, parkId: values.parkId, mobile: values.mobile, scene: "login" }
      });
      setMessage(response.data.mockCode ? `验证码已生成：${response.data.mockCode}` : "验证码已发送");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "验证码发送失败");
    } finally {
      setCodeSending(false);
    }
  }

  async function handleMobileSubmit(payload: MobileLoginValues) {
    setLoading(true);
    setMessage("");
    try {
      const response = await apiRequest<LoginResult>("/auth/mobile/login", {
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

  async function startWechatLogin() {
    setLoading(true);
    setMessage("");
    try {
      const values = await wechatForm.validateFields();
      const response = await apiRequest<WechatAuthorizeResult>("/auth/wechat/authorize", {
        method: "POST",
        body: {
          tenantId: values.tenantId,
          parkId: values.parkId,
          redirectUri: window.location.origin + window.location.pathname
        }
      });
      window.location.assign(response.data.authorizationUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "微信登录初始化失败");
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

        <Segmented
          block
          className="signin-mode"
          onChange={(value) => setMode(value as LoginMode)}
          options={[
            { label: "账号密码", value: "password" },
            { label: "手机验证码", value: "mobile" },
            { label: "微信扫码", value: "wechat" }
          ]}
          value={mode}
        />

        {mode === "password" ? (
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
        ) : mode === "mobile" ? (
          <Form<MobileLoginValues> className="signin-form" form={mobileForm} layout="vertical" onFinish={handleMobileSubmit}>
            <div className="signin-scope-grid">
              <Form.Item label="租户 ID" name="tenantId" rules={[{ required: true, message: "请输入租户 ID" }]}>
                <Input autoComplete="organization" placeholder="tenant_id" prefix={<Building2 size={16} />} size="large" />
              </Form.Item>
              <Form.Item label="园区 ID" name="parkId" rules={[{ required: true, message: "请输入园区 ID" }]}>
                <Input autoComplete="off" placeholder="park_id" prefix={<MapPinned size={16} />} size="large" />
              </Form.Item>
            </div>
            <Form.Item label="手机号" name="mobile" rules={[{ required: true, message: "请输入手机号" }]}>
              <Input autoComplete="tel" placeholder="请输入绑定手机号" prefix={<Phone size={16} />} size="large" />
            </Form.Item>
            <div className="signin-code-row">
              <Form.Item label="验证码" name="code" rules={[{ required: true, message: "请输入验证码" }]}>
                <Input autoComplete="one-time-code" placeholder="请输入验证码" prefix={<ShieldCheck size={16} />} size="large" />
              </Form.Item>
              <Button className="signin-code-button" loading={codeSending} onClick={() => void sendMobileCode()} size="large" type="default">
                获取验证码
              </Button>
            </div>

            <Button block className="signin-submit" htmlType="submit" icon={<LogIn size={17} />} loading={loading} size="large" type="primary">
              手机登录
            </Button>
            {message ? <Alert className="signin-alert" message={message} showIcon type="warning" /> : null}
          </Form>
        ) : (
          <Form<WechatLoginValues> className="signin-form" form={wechatForm} layout="vertical">
            <div className="signin-wechat-panel">
              <span className="signin-provider-icon">
                <QrCode size={28} />
              </span>
              <div>
                <strong>微信扫码登录</strong>
                <p>支持微信开放平台授权。本地开发环境会进入模拟回调，不需要真实微信密钥。</p>
              </div>
            </div>
            <div className="signin-scope-grid">
              <Form.Item label="租户 ID" name="tenantId" rules={[{ required: true, message: "请输入租户 ID" }]}>
                <Input autoComplete="organization" placeholder="tenant_id" prefix={<Building2 size={16} />} size="large" />
              </Form.Item>
              <Form.Item label="园区 ID" name="parkId" rules={[{ required: true, message: "请输入园区 ID" }]}>
                <Input autoComplete="off" placeholder="park_id" prefix={<MapPinned size={16} />} size="large" />
              </Form.Item>
            </div>

            <Button block className="signin-submit" icon={<QrCode size={17} />} loading={loading} onClick={() => void startWechatLogin()} size="large" type="primary">
              进入微信授权
            </Button>
            <p className="signin-provider-note">首次使用微信登录时，需要先完成账号绑定；绑定能力已由认证中心预留。</p>
            {message ? <Alert className="signin-alert" message={message} showIcon type="warning" /> : null}
          </Form>
        )}
      </section>
    </main>
  );
}
