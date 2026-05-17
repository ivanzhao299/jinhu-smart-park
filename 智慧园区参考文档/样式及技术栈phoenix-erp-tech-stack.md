# Phoenix ERP V3 — 技术栈 & 设计系统参考手册

> 适用版本：Phoenix ERP V3（2026-05）
> 可直接复用到任何新工程。

---

## 一、技术栈总览

### 前端（apps/web）

| 分类 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) | 16.2.6 |
| UI 库 | React | 19.2.4 |
| 语言 | TypeScript | ^5 |
| 图标库 | lucide-react | ^1.14.0 |
| 字体 | Inter (Google Fonts) | 300/400/500/600/700/800 |
| CSS | Vanilla CSS（CSS Variables）| — |
| 打包 | Turbopack (Next.js 内置) | — |
| Lint | ESLint + eslint-config-next | ^9 |

**前端 package.json 核心依赖：**
```json
{
  "dependencies": {
    "next": "16.2.6",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "lucide-react": "^1.14.0"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.6"
  }
}
```

---

### 后端（apps/api）

| 分类 | 技术 | 版本 |
|------|------|------|
| 框架 | NestJS | ^10 |
| 语言 | TypeScript | ^5 |
| ORM | TypeORM | ^0.3.17 |
| 数据库（生产） | PostgreSQL | ^8（pg 驱动）|
| 数据库（开发） | SQLite | ^5.1.7 |
| 认证 | JWT + Passport | jsonwebtoken ^9, passport-jwt ^4 |
| 密码加密 | bcrypt | ^5.1.1 |
| 定时任务 | @nestjs/schedule | ^6.1.3 |
| 上下文传递 | nestjs-cls | ^3.6.0 |

**后端 package.json 核心依赖：**
```json
{
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/config": "^3.1.1",
    "@nestjs/passport": "^10.0.2",
    "@nestjs/platform-express": "^10.0.0",
    "@nestjs/schedule": "^6.1.3",
    "@nestjs/typeorm": "^10.0.0",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.3",
    "nestjs-cls": "^3.6.0",
    "passport": "^0.6.0",
    "passport-jwt": "^4.0.1",
    "pg": "^8.11.3",
    "rxjs": "^7.8.1",
    "sqlite3": "^5.1.7",
    "typeorm": "^0.3.17"
  }
}
```

---

## 二、设计系统（CSS Variables）

直接将以下内容复制到你的 `globals.css` 即可使用所有 Token。

### 2.1 globals.css 完整源码

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

/* ══════════════════════════════════════════════════════════════
   Phoenix ERP — Design Tokens
   Single source of truth. No aliases. No duplication.
   Naming: semantic intent over implementation detail.
══════════════════════════════════════════════════════════════ */
:root {
  /* Brand */
  --color-primary: #1F3864;
  --color-accent:  #E91E63;

  /* Status */
  --status-success: #2E7D32;
  --status-warning: #F9A825;
  --status-danger:  #C62828;
  --status-info:    #1976D2;
  --status-neutral: #757575;
  --status-special: #6A1B9A;

  /* Text */
  --text-primary:      #212121;
  --text-secondary:    #757575;
  --text-disabled:     #BDBDBD;
  --text-on-dark:      #f8fafc;
  --text-on-dark-muted:#94a3b8;

  /* Surface */
  --bg-page:    #FAFAFA;
  --bg-card:    #FFFFFF;
  --bg-muted:   #F5F5F5;
  --bg-sidebar: #05192c;

  /* Border */
  --border:      #E0E0E0;
  --border-dark: #1e3a5c;

  /* Layout */
  --sidebar-width: 220px;
  --header-height: 56px;

  /* Elevation */
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.10);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.10);
  --shadow-lg: 0 10px 30px rgba(0,0,0,0.14);

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 24px;

  /* Motion */
  --ease: cubic-bezier(0.4, 0, 0.2, 1);

  /* Glass */
  --glass-bg:     rgba(255,255,255,0.72);
  --glass-border: rgba(255,255,255,0.20);
}

/* ── Dark Mode ──────────────────────────────────────────────── */
[data-theme="dark"] {
  --color-primary: #4A78B5;
  --color-accent:  #F06292;

  --status-success: #66BB6A;
  --status-warning: #FFD54F;
  --status-danger:  #EF5350;
  --status-info:    #64B5F6;
  --status-special: #BA68C8;

  --text-primary:   #FAFAFA;
  --text-secondary: #BDBDBD;
  --text-disabled:  #616161;

  --bg-page:    #121212;
  --bg-card:    #1E1E1E;
  --bg-muted:   #2C2C2C;
  --bg-sidebar: #1A1A1A;

  --border: #424242;

  --shadow-sm: 0 1px 3px rgba(0,0,0,0.30);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.40);
  --shadow-lg: 0 10px 30px rgba(0,0,0,0.50);

  --glass-bg:     rgba(30,30,30,0.72);
  --glass-border: rgba(255,255,255,0.05);
}

/* ── Base ──────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  height: 100%;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  font-size: 14px;
  background: var(--bg-page);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  line-height: 1.5;
}

a { color: inherit; text-decoration: none; }
ul { list-style: none; }

input, textarea, select {
  font-family: inherit;
  font-size: inherit;
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  outline: none;
  transition: border-color 0.18s var(--ease);
}
input:focus, textarea:focus, select:focus { border-color: var(--color-primary); }
input:disabled, textarea:disabled, select:disabled {
  background: var(--bg-muted);
  color: var(--text-disabled);
  cursor: not-allowed;
}

/* ── Scrollbar ──────────────────────────────────────────────── */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.22); }
[data-theme="dark"] ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); }

/* ── Animations ─────────────────────────────────────────────── */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; }
}
@keyframes shimmer { 0%,100% { opacity:.4; } 50% { opacity:.85; } }

.animate-fade-in { animation: fadeIn 0.24s var(--ease) both; }
.skeleton        { animation: shimmer 1.4s ease-in-out infinite; background: var(--bg-muted); border-radius: var(--radius-sm); }

/* ── Glass card ─────────────────────────────────────────────── */
.glass-card {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

/* ── Accessibility ──────────────────────────────────────────── */
.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0,0,0,0); border: 0;
}

/* ── Print ───────────────────────────────────────────────────── */
.print-area { display: none; }
@media print {
  body * { visibility: hidden; }
  .print-area { display: block !important; position: absolute; inset: 0; visibility: visible; }
  .print-area * { visibility: visible; }
  .no-print { display: none !important; }
  @page { margin: 1.5cm 1cm; }
  .print-area table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .print-area th, .print-area td { border: 1px solid #999; padding: 5px 8px; }
  .print-area th { background: #f0f0f0 !important; font-weight: 700; print-color-adjust: exact; }
  .print-area tr { page-break-inside: avoid; }
}

/* ── Mobile ─────────────────────────────────────────────────── */
@media (max-width: 768px) {
  :root { --sidebar-width: 0px; }
}
```

---

## 三、Design Token 速查表

### 3.1 颜色

| Token | 亮色值 | 暗色值 | 用途 |
|-------|--------|--------|------|
| `--color-primary` | `#1F3864` | `#4A78B5` | 主色：按钮、链接、激活态 |
| `--color-accent` | `#E91E63` | `#F06292` | 强调色：红点、特殊标记 |
| `--status-success` | `#2E7D32` | `#66BB6A` | 成功/正常 |
| `--status-warning` | `#F9A825` | `#FFD54F` | 警告/待处理 |
| `--status-danger` | `#C62828` | `#EF5350` | 错误/危险 |
| `--status-info` | `#1976D2` | `#64B5F6` | 信息/提示 |
| `--status-neutral` | `#757575` | — | 中性/禁用 |
| `--status-special` | `#6A1B9A` | `#BA68C8` | 特殊业务标记（VIP 等）|
| `--text-primary` | `#212121` | `#FAFAFA` | 主要文字 |
| `--text-secondary` | `#757575` | `#BDBDBD` | 次要文字、说明 |
| `--text-disabled` | `#BDBDBD` | `#616161` | 禁用态文字 |
| `--text-on-dark` | `#f8fafc` | — | 深色背景上的文字 |
| `--bg-page` | `#FAFAFA` | `#121212` | 页面底色 |
| `--bg-card` | `#FFFFFF` | `#1E1E1E` | 卡片/输入框背景 |
| `--bg-muted` | `#F5F5F5` | `#2C2C2C` | 弱化背景、hover 态 |
| `--bg-sidebar` | `#05192c` | `#1A1A1A` | 侧边栏背景 |
| `--border` | `#E0E0E0` | `#424242` | 通用边框 |
| `--border-dark` | `#1e3a5c` | — | 深色区域边框 |

### 3.2 阴影

| Token | 值 | 用途 |
|-------|-----|------|
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.10)` | 微浮起（按钮、tag）|
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.10)` | 卡片 |
| `--shadow-lg` | `0 10px 30px rgba(0,0,0,0.14)` | 弹窗、Drawer |

### 3.3 圆角

| Token | 值 | 用途 |
|-------|-----|------|
| `--radius-sm` | `4px` | tag、badge |
| `--radius-md` | `8px` | 输入框、按钮 |
| `--radius-lg` | `12px` | 卡片 |
| `--radius-xl` | `24px` | 全圆角（头像、Pill）|

### 3.4 布局

| Token | 值 | 用途 |
|-------|-----|------|
| `--sidebar-width` | `220px` | 侧边栏宽度 |
| `--header-height` | `56px` | 顶栏高度 |
| `--ease` | `cubic-bezier(0.4,0,0.2,1)` | Material 缓动曲线 |

---

## 四、常用 UI 组件代码模板

### 4.1 主按钮
```tsx
<button style={{
  background: "var(--color-primary)", color: "#fff",
  border: "none", borderRadius: "var(--radius-md)",
  padding: "10px 20px", fontSize: 14, fontWeight: 600,
  cursor: "pointer", transition: "opacity 0.15s"
}}
onMouseOver={e => e.currentTarget.style.opacity = "0.88"}
onMouseOut={e => e.currentTarget.style.opacity = "1"}
>
  保存
</button>
```

### 4.2 状态徽章
```tsx
const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  ACTIVE:   { bg: "#E8F5E9", color: "var(--status-success)", label: "正常" },
  INACTIVE: { bg: "#FFF3E0", color: "var(--status-warning)", label: "停用" },
  CLOSED:   { bg: "#FFEBEE", color: "var(--status-danger)",  label: "关闭" },
};

<span style={{
  background: STATUS_STYLE[status].bg,
  color: STATUS_STYLE[status].color,
  padding: "2px 10px", borderRadius: "var(--radius-xl)",
  fontSize: 12, fontWeight: 600
}}>
  {STATUS_STYLE[status].label}
</span>
```

### 4.3 数字输入框（必须带 onFocus 全选）
```tsx
<input
  type="number"
  value={form.amount}
  onChange={e => setForm({...form, amount: e.target.value})}
  onFocus={e => e.target.select()}   // ← 必须有，点击自动全选
  placeholder="0"
  style={{
    width: "100%", padding: "10px 14px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    background: "var(--bg-page)", color: "var(--text-primary)",
    fontSize: 14, outline: "none", boxSizing: "border-box"
  }}
/>
```

### 4.4 标准 CRUD fetch 模板（必须检查 res.ok）
```tsx
// ✅ 保存（POST / PUT）
const handleSave = async () => {
  setSaving(true);
  try {
    const token = sessionStorage.getItem("phoenix_token") || "";
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    const payload = { field1: form.field1, field2: form.field2 }; // 字段名必须与 DB 列名一致

    const res = editId
      ? await fetch(`/api/crud/表名/${editId}`, { method: "PUT",  headers, body: JSON.stringify(payload) })
      : await fetch(`/api/crud/表名`,           { method: "POST", headers, body: JSON.stringify(payload) });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    toast.success(editId ? "更新成功" : "创建成功");
    loadData();
    setDrawerOpen(false);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "操作失败");
  } finally {
    setSaving(false);
  }
};

// ✅ 删除（DELETE）
const handleDelete = async (id: string) => {
  if (!confirm("确认删除？")) return;
  try {
    const token = sessionStorage.getItem("phoenix_token") || "";
    const res = await fetch(`/api/crud/表名/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    toast.success("删除成功");
    loadData();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "删除失败");
  }
};
```

### 4.5 Glass Card
```tsx
<div className="glass-card" style={{ padding: 24 }}>
  {/* 内容 */}
</div>
```

### 4.6 Skeleton 加载占位
```tsx
{loading ? (
  <div className="skeleton" style={{ height: 80, marginBottom: 12 }} />
) : (
  <YourContent />
)}
```

---

## 五、root layout.tsx 初始化脚本（主题 + Favicon 闪烁防护）

```tsx
// app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "你的应用名",
  description: "应用描述",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-theme="light">
      <head>
        {/* 同步阻塞脚本：防止主题闪白 */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){
  try {
    var t = localStorage.getItem('app_theme');
    var resolved = t === 'dark' ? 'dark'
      : t === 'light' ? 'light'
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', resolved);
  } catch(e) {}
})();` }} />
        {/* 字体预连接 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

---

## 六、next.config.ts 标准配置

```ts
import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Turbopack 根目录（monorepo 时设为 workspace root）
  turbopack: { root: path.resolve(__dirname, "../..") },

  // 允许 HMR 跨源（开发环境）
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  // API 反向代理（前端请求 /api/* → 后端 3100 端口）
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "http://127.0.0.1:3100/api/:path*" },
    ];
  },

  images: {
    remotePatterns: [
      { protocol: "http",  hostname: "127.0.0.1" },
      { protocol: "https", hostname: "**" },
    ],
  },

  compiler: {
    removeConsole: process.env.NODE_ENV === "production"
      ? { exclude: ["error", "warn"] }
      : false,
  },

  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,

  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
```

---

## 七、开发规范速查（必须遵守）

| # | 规范 | 说明 |
|---|------|------|
| 1 | **DB 列名先查再写** | payload 的 key 必须与 `CREATE TABLE` / `ALTER TABLE ADD COLUMN` 的列名完全一致 |
| 2 | **数字输入必须全选** | 所有 `type="number"` 必须加 `onFocus={e => e.target.select()}` |
| 3 | **写操作必须检查 res.ok** | POST/PUT/DELETE 失败必须 `toast.error()`，不能只 `await fetch(...)` |
| 4 | **启动脚本禁止硬编码路径** | 使用 `$PROJECT_DIR/apps/api`，不要写死绝对路径 |
| 5 | **暗色模式通过 data-theme** | `document.documentElement.setAttribute('data-theme', 'dark')` |
| 6 | **主题切换同步写 localStorage** | `localStorage.setItem('app_theme', 'dark')` |

---

*文档生成时间：2026-05-12*
*来源工程：Phoenix ERP V3 — /Users/mac/Antigravity/ABC*
