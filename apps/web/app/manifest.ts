import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "金湖园区数字运营平台",
    short_name: "金湖园区",
    description: "金湖科创产业园智慧园区运营管理平台",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    background_color: "#06263f",
    theme_color: "#0b4f7a",
    icons: [
      {
        src: "/icons/jinhu-app-icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/icons/jinhu-app-icon-512.png",
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: "/icons/jinhu-app-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
