"use client";

import { App as AntApp, ConfigProvider, theme as antdTheme } from "antd";
import zhCN from "antd/locale/zh_CN";
import type { ReactNode } from "react";
import { useTheme } from "./ThemeProvider";

interface DesignSystemProviderProps {
  children: ReactNode;
}

export function DesignSystemProvider({ children }: DesignSystemProviderProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: isDark ? "#16A6D9" : "#0B7FAB",
          colorInfo: isDark ? "#60A5FA" : "#2563EB",
          colorSuccess: isDark ? "#22C55E" : "#1F8A5B",
          colorWarning: isDark ? "#F59E0B" : "#D97706",
          colorError: isDark ? "#EF4444" : "#C2410C",
          colorBgLayout: isDark ? "#07111C" : "#F3F6FA",
          colorBgContainer: isDark ? "#0E1C2A" : "#FFFFFF",
          colorBorder: isDark ? "#1E3A4C" : "#D7DEE8",
          colorText: isDark ? "#E5EEF6" : "#17212B",
          colorTextSecondary: isDark ? "#9FB0C3" : "#637083",
          borderRadius: 8,
          fontFamily: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        },
        components: {
          Button: {
            borderRadius: 8,
            controlHeight: 36,
            controlHeightLG: 42,
            controlHeightSM: 30,
            fontWeight: 600
          },
          Card: {
            borderRadiusLG: 12
          },
          Table: {
            borderColor: isDark ? "#1E3A4C" : "#D7DEE8",
            headerBg: isDark ? "#132437" : "#E9EEF5",
            headerColor: isDark ? "#E5EEF6" : "#17212B"
          }
        }
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
