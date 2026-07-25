import type { Viewport } from "next";
import { HomestayOperationsClient } from "./HomestayOperationsClient";

export const viewport: Viewport = {
  themeColor: "#102a43"
};

export default function HomestayPage() {
  return <HomestayOperationsClient />;
}
