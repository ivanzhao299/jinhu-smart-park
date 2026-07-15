import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "金湖园区数字运营平台",
    short_name: "金湖园区",
    description: "金湖科创产业园智慧园区运营管理平台",
    start_url: "/login",
    id: "/",
    scope: "/",
    display: "standalone",
    background_color: "#111827",
    theme_color: "#111827",
    categories: ["business", "productivity"],
    shortcuts: [
      {
        name: "移动作业终端",
        short_name: "作业终端",
        description: "进入园区现场作业终端",
        url: "/operations/terminal"
      },
      {
        name: "工程作业终端",
        short_name: "工程终端",
        description: "进入工程项目现场作业终端",
        url: "/engineering/terminal"
      }
    ],
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
