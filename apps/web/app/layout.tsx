import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "../components/theme/ThemeProvider";
import { DesignSystemProvider } from "../components/theme/DesignSystemProvider";
import "antd/dist/reset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "金湖科创产业园 SaaS 平台",
  description: "金湖科创产业园资产、招商、合同与运营数字化平台"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                try {
                  var t = localStorage.getItem('jinhu_theme') || localStorage.getItem('app_theme') || 'light';
                  var d = document.documentElement;
                  if (t === 'system') {
                    d.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  } else {
                    d.dataset.theme = t;
                  }
                } catch (e) {}
              })();
            `
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <ThemeProvider>
          <DesignSystemProvider>{children}</DesignSystemProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
