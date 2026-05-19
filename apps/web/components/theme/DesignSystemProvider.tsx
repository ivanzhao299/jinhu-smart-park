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
          colorPrimary: isDark ? "#4A78B5" : "#1F3864",
          colorInfo: isDark ? "#64B5F6" : "#1976D2",
          colorSuccess: isDark ? "#66BB6A" : "#2E7D32",
          colorWarning: isDark ? "#FFD54F" : "#F9A825",
          colorError: isDark ? "#EF5350" : "#C62828",
          colorBgLayout: isDark ? "#121212" : "#FAFAFA",
          colorBgContainer: isDark ? "#1E1E1E" : "#FFFFFF",
          colorBorder: isDark ? "#424242" : "#E0E0E0",
          colorText: isDark ? "#FAFAFA" : "#212121",
          colorTextSecondary: isDark ? "#BDBDBD" : "#757575",
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
            borderColor: isDark ? "#424242" : "#E0E0E0",
            headerBg: isDark ? "#2C2C2C" : "#F5F5F5",
            headerColor: isDark ? "#FAFAFA" : "#212121"
          }
        }
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
