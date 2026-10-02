import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "园区餐厅 POS 收银终端",
  robots: { index: false, follow: false }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover"
};

interface PosLayoutProps {
  children: React.ReactNode;
}

/** POS 为全屏横屏 kiosk 终端，不套管理端 DashboardLayout。 */
export default function PosLayout({ children }: PosLayoutProps) {
  return children;
}
