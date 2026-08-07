# Implementation Plan

1. 新增 Android Gradle/Kotlin 工程、品牌资源、WebView 主界面、文件选择、定位、下载更新与安装流程。
2. 新增发布清单类型、读取逻辑和登录后“客户端下载”页面，并在桌面页头及移动终端页头提供入口。
3. 新增 Android CI：JDK/SDK/Gradle、secret 签名、release 构建、APK 元数据校验、哈希清单、artifact、发布资产提交。
4. 调整生产工作流分类规则，使 Android 源码走独立构建链、已生成 Web 发布资产走 Web 级部署。
5. 增加本地 Android 发布校验脚本及 package scripts。
6. 同步 README、生产部署文档与 Android 专项发布/安装/回滚文档。
7. 验证：部署分类单测、Android 静态检查/Gradle release 构建（环境可用时）、Web typecheck/lint/build、脚本语法、git diff check。
8. 使用登录态桌面与 390px 手机视口检查客户端下载入口和页面；真机安装/相机/定位如缺设备则明确列为待现场验收。

## Rollback Points

- Android 壳不改变 API/数据库，可独立回滚。
- 下载页面为新增路由和固定入口，可随 Web 提交回滚。
- 发布资产可恢复上一版 `latest.json` 与 APK。
- 不修改或重置当前工程巡检任务的未提交文件。
