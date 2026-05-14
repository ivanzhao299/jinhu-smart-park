import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "金湖科创产业园智慧园区管理系统",
  description: "智慧园区运营、安防、资产与租户管理平台"
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
