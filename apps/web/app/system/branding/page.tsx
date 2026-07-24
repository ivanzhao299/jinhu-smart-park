"use client";

import { Card, Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader } from "@jinhu/ui";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { CheckCircle2, Palette, Pencil, Save, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { THEME_OPTIONS, type Theme, useTheme } from "../../../components/theme/ThemeProvider";
import {
  defaultAppBranding,
  fetchCurrentBranding,
  readStoredBranding,
  saveCurrentBranding
} from "../../../lib/app-branding";
import { getToken } from "../../../lib/auth";

interface BrandingFormState {
  systemName: string;
  shortName: string;
  logoAlt: string;
  theme: Theme;
}

export default function SystemBrandingPage() {
  return (
    <PermissionGuard module="system" permission={SYSTEM_PERMISSIONS.TENANT_MANAGE} fallback={<Forbidden />}>
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
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let active = true;
    const cachedBranding = readStoredBranding();
    setForm((current) => ({ ...current, ...cachedBranding }));
    const token = getToken();
    if (token) {
      void fetchCurrentBranding(token)
        .then(async (branding) => {
          if (!active) return;
          if (!branding.configured && hasCustomBranding(cachedBranding)) {
            const migratedBranding = await saveCurrentBranding(token, cachedBranding);
            if (!active) return;
            setForm((current) => ({ ...current, ...migratedBranding }));
            setMessage("原浏览器品牌设置已同步到系统");
            return;
          }
          setForm((current) => ({ ...current, ...branding }));
        })
        .catch((loadError: unknown) => {
          if (active) setError(loadError instanceof Error ? loadError.message : "品牌设置加载失败");
        });
    }
    return () => {
      active = false;
    };
  }, []);

  const updateField = <K extends keyof BrandingFormState>(key: K, value: BrandingFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };
  const previewTheme = (value: Theme) => {
    setMessage("");
    updateField("theme", value);
    setTheme(value);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const token = getToken();
      if (!token) throw new Error("登录状态已失效，请重新登录");
      await saveCurrentBranding(token, form);
      setTheme(form.theme);
      setMessage("品牌设置已保存并同步到登录页");
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "品牌设置保存失败");
    } finally {
      setSaving(false);
    }
  };

  function closeEditor() {
    const branding = readStoredBranding();
    setForm({ ...branding, theme });
    setTheme(theme);
    setEditing(false);
  }

  return (
    <main className="page-container brand-settings-page">
      <Card className="page-header">
        <div className="header-title">
          <strong>品牌设置</strong>
          <span>系统名称与全局主题方案</span>
        </div>
        <button className="primary-button" type="button" onClick={() => { setMessage(""); setEditing(true); }}>
          <Pencil size={16} />
          编辑品牌设置
        </button>
      </Card>

      {message ? (
        <div className="form-success" role="status">
          <CheckCircle2 size={16} />
          {message}
        </div>
      ) : null}
      {error ? <div className="form-error" role="alert">{error}</div> : null}

      <Card className="ds-panel brand-settings-panel">
        <div className="brand-settings-preview" aria-label="品牌预览">
          <img alt={form.logoAlt || defaultAppBranding.logoAlt} src="/brand/jinhupark-logo.svg" />
          <div>
            <span>当前系统名称</span>
            <strong>{form.systemName || defaultAppBranding.systemName}</strong>
            <small>{form.shortName || defaultAppBranding.shortName}</small>
          </div>
        </div>
      </Card>

      {editing ? (
        <Drawer size="md" onClose={closeEditor}>
          <DrawerHeader
            eyebrow="系统管理"
            title="编辑品牌设置"
            description="维护系统名称、简称、Logo 文本与全局配色方案。"
            onClose={closeEditor}
            closeIcon={<X size={18} />}
          />
          <DrawerForm onSubmit={handleSubmit}>
            <DrawerFormGrid>
              <label className="field">
                <span>系统名称</span>
                <input
                  value={form.systemName}
                  maxLength={32}
                  onChange={(event) => updateField("systemName", event.target.value)}
                  placeholder="例如：园区数字运营平台"
                  required
                />
              </label>
              <label className="field">
                <span>系统简称</span>
                <input
                  value={form.shortName}
                  maxLength={24}
                  onChange={(event) => updateField("shortName", event.target.value)}
                  placeholder="例如：金湖科创产业园"
                  required
                />
              </label>
              <label className="field">
                <span>Logo 替代文本</span>
                <input
                  value={form.logoAlt}
                  maxLength={32}
                  onChange={(event) => updateField("logoAlt", event.target.value)}
                  placeholder="例如：金湖科创产业园"
                  required
                />
              </label>
              <label className="field">
                <span>全局配色方案</span>
                <select value={form.theme} onChange={(event) => previewTheme(event.target.value as Theme)}>
                  {THEME_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </DrawerFormGrid>
            <DrawerFormGrid single>
              <div className="field">
                <label>配色方案</label>
                <div className="theme-scheme-grid" aria-label="配色方案">
                  {THEME_OPTIONS.map((option) => (
                    <button
                      aria-pressed={form.theme === option.value}
                      className="theme-scheme-card"
                      data-theme-option={option.value}
                      key={option.value}
                      type="button"
                      onClick={() => previewTheme(option.value)}
                    >
                      <Palette size={16} />
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </DrawerFormGrid>
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={closeEditor}>取消</button>
              <button className="primary-button" disabled={saving} type="submit">
                <Save size={16} />
                {saving ? "保存中..." : "保存"}
              </button>
            </DrawerFooter>
          </DrawerForm>
        </Drawer>
      ) : null}
    </main>
  );
}

function hasCustomBranding(branding: typeof defaultAppBranding): boolean {
  return (
    branding.systemName !== defaultAppBranding.systemName ||
    branding.shortName !== defaultAppBranding.shortName ||
    branding.logoAlt !== defaultAppBranding.logoAlt
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
