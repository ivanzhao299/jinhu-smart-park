import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "../components/theme/ThemeProvider";
import { DesignSystemProvider } from "../components/theme/DesignSystemProvider";
import { QueryProvider } from "../components/runtime/QueryProvider";
import "antd/dist/reset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "金湖科创产业园 SaaS 平台",
  description: "金湖科创产业园资产、招商、合同与运营数字化平台",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/jinhu-app-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/jinhu-app-icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  appleWebApp: {
    capable: true,
    title: "金湖园区",
    statusBarStyle: "black-translucent"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b4f7a"
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
                  var supportedThemes = ['dark', 'light', 'system', 'enterprise-light', 'harbor-blue', 'forest-green', 'graphite-gold', 'command-dark'];
                  if (supportedThemes.indexOf(t) === -1) {
                    t = 'light';
                  }
                  if (t === 'system') {
                    d.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  } else {
                    d.dataset.theme = t;
                  }
                } catch (e) {}
                try {
                  var collapsed = localStorage.getItem('jinhu_sidebar_collapsed') === '1';
                  if (collapsed) {
                    document.documentElement.dataset.sidebarCollapsed = 'true';
                  } else {
                    delete document.documentElement.dataset.sidebarCollapsed;
                  }
                } catch (e) {}
              })();
            `
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="/runtime-design-system.css" />
      </head>
      <body>
        <ThemeProvider>
          <QueryProvider>
            <DesignSystemProvider>{children}</DesignSystemProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
