"use client";

import { Card } from "@jinhu/ui";
import { CheckCircle2, Palette, Save } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { THEME_OPTIONS, type Theme, useTheme } from "../../../components/theme/ThemeProvider";
import { defaultAppBranding, readStoredBranding, writeStoredBranding } from "../../../lib/app-branding";

interface BrandingFormState {
  systemName: string;
  shortName: string;
  logoAlt: string;
  theme: Theme;
}

export default function SystemBrandingPage() {
  return (
    <PermissionGuard module="system" permission="system:read" fallback={<Forbidden />}>
      <BrandingSettings />
    </PermissionGuard>
  );
}

function BrandingSettings() {
  const { theme, setTheme } = useTheme();
  const [form, setForm] = useState<BrandingFormState>({
    ...defaultAppBranding,
    theme
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    const branding = readStoredBranding();
    setForm({ ...branding, theme });
  }, [theme]);

  const updateField = <K extends keyof BrandingFormState>(key: K, value: BrandingFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    writeStoredBranding(form);
    setTheme(form.theme);
    setMessage("品牌设置已应用");
  };

  return (
    <main className="page-container brand-settings-page">
      <Card className="page-header">
        <div className="header-title">
          <strong>品牌设置</strong>
          <span>系统名称与全局主题方案</span>
        </div>
      </Card>

      {message ? (
        <div className="form-success" role="status">
          <CheckCircle2 size={16} />
          {message}
        </div>
      ) : null}

      <form onSubmit={handleSubmit}>
        <Card className="ds-panel brand-settings-panel">
          <div className="brand-settings-preview" aria-label="品牌预览">
            <img alt={form.logoAlt || defaultAppBranding.logoAlt} src="/brand/jinhupark-logo.svg" />
            <div>
              <span>当前系统名称</span>
              <strong>{form.systemName || defaultAppBranding.systemName}</strong>
              <small>{form.shortName || defaultAppBranding.shortName}</small>
            </div>
          </div>

          <div className="drawer-form-grid">
            <label>
              系统名称
              <input
                value={form.systemName}
                maxLength={32}
                onChange={(event) => updateField("systemName", event.target.value)}
                placeholder="例如：园区数字运营平台"
                required
              />
            </label>
            <label>
              系统简称
              <input
                value={form.shortName}
                maxLength={24}
                onChange={(event) => updateField("shortName", event.target.value)}
                placeholder="例如：金湖科创产业园"
                required
              />
            </label>
            <label>
              Logo 替代文本
              <input
                value={form.logoAlt}
                maxLength={32}
                onChange={(event) => updateField("logoAlt", event.target.value)}
                placeholder="例如：金湖科创产业园"
                required
              />
            </label>
            <label>
              全局配色方案
              <select value={form.theme} onChange={(event) => updateField("theme", event.target.value as Theme)}>
                {THEME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="theme-scheme-grid" aria-label="配色方案">
            {THEME_OPTIONS.map((option) => (
              <button
                aria-pressed={form.theme === option.value}
                className="theme-scheme-card"
                data-theme-option={option.value}
                key={option.value}
                type="button"
                onClick={() => updateField("theme", option.value)}
              >
                <Palette size={16} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>

          <div className="system-actions">
            <button className="primary-button" type="submit">
              <Save size={16} />
              保存品牌设置
            </button>
          </div>
        </Card>
      </form>
    </main>
  );
}

function Forbidden() {
  return (
    <main className="page-container">
      <Card>
        <h1>403</h1>
        <p>无权访问品牌设置。</p>
      </Card>
    </main>
  );
}
