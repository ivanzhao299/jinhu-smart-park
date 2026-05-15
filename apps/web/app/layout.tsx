import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "产业园数字运营 SaaS 平台",
  description: "产业园资产、组织、权限与运营数字化平台"
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('jinhu_theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t;}}catch(e){}"
          }}
        />
        {children}
      </body>
    </html>
  );
}
