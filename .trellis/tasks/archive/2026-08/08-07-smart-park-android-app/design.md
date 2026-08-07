# Technical Design

## Architecture

采用“原生薄壳 + 现有响应式 Web 业务”架构：

1. `android-app/` 提供 Kotlin Android WebView 容器，默认打开 `https://park.cnjinhu.com/login`。
2. 登录、身份选择、权限、巡检、工单和上传继续复用现有 Web/API，不复制业务规则。
3. `apps/web/public/downloads/android/` 承载 `latest.json` 与 release APK；Next.js 生产 Web 原样提供稳定下载 URL。
4. 登录后的 `/system/client-downloads` 页面读取 `latest.json`，向所有已认证用户展示 Android 客户端信息和下载按钮。
5. `.github/workflows/android-build.yml` 在 Android 源码变化时构建、签名、计算 SHA-256、生成清单并提交发布资产；发布资产提交触发现有 Web 级生产部署。

## Android Runtime

- applicationId: `com.jinhu.smartpark`
- minSdk 24，target/compile SDK 35，JDK 17。
- WebView 开启 DOM storage、Cookie、第三方 Cookie、文件选择与地理位置授权。
- 同源园区 URL在 WebView 内打开；电话、短信、地图及外部 URL交给系统应用。
- Android 返回键优先回退 WebView 历史；首页再次返回时二次确认退出。
- 网络失败显示可重试错误页，不用白屏承载失败。
- 启动及恢复时读取远端 `latest.json`；新版本弹窗确认后交给 DownloadManager 下载，完成后发起系统安装。
- 下载 APK 使用系统 `REQUEST_INSTALL_PACKAGES` 流程，用户首次需允许“安装未知应用”。

## Distribution Contract

`latest.json` 字段：`platform`、`versionCode`、`versionName`、`fileName`、`downloadUrl`、`sha256`、`sizeBytes`、`builtAt`、`commit`、`releaseNotes`。

- 页面和 APP 共用同一清单，避免版本信息双写。
- CI 校验 APK 的版本号与清单一致，并生成版本化文件及 `smart-park-latest.apk`。
- 签名材料只从 GitHub Environment secrets 注入：`ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。
- 仓库只保存签名配置模板，不保存 keystore 或密码。

## Auth And Visibility

- 页面位于 dashboard layout 内，未登录访问会被现有鉴权布局重定向登录。
- 入口作为登录后固定客户端工具入口，不新增数据库菜单、权限或迁移，避免普通物业/工程人员因角色菜单差异看不到下载。
- APK 静态 URL可被持有链接者访问；本期保护的是 UI 可见性而非二进制机密性。APK 不包含业务凭证或秘密。

## Deployment

- `android-app/**` 和 Android 构建工作流由独立 Android CI 消费，生产分类最多进入 Web 范围，不触发 API 或数据库迁移。
- `apps/web/public/downloads/android/**` 被现有分类器识别为 `web`，只构建/重启 Web，不执行迁移。
- Android CI 的机器人提交随后自然进入现有生产部署，并保留健康检查与 Docker 清理。
- 回滚通过恢复上一版 APK/清单提交完成；已安装客户端仍可继续使用当前 Web 业务。

## Compatibility And Risks

- 固定签名 secrets 未配置时 release 发布必须失败，不能生成不可覆盖升级的临时签名包。
- WebView 相机/定位行为需真机验证；桌面浏览器无法替代 Android 权限验收。
- 若生产站点证书异常，APP 不绕过 TLS 校验。
