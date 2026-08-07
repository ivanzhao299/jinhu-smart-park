# Android 客户端构建与发布

## 用户入口

登录 `https://park.cnjinhu.com` 后，点击顶栏下载图标进入 `/system/client-downloads`。普通后台和移动作业终端都提供该入口。页面从 `/downloads/android/latest.json` 读取版本信息并下载对应 APK。

## 发布链

1. 修改 `android-app/**` 中的版本号或客户端代码并推送 `main`。
2. `android-build.yml` 使用 JDK 17、Android SDK 35 和 Gradle 8.9 构建 release APK。
3. CI 使用 production environment 的固定签名 secrets 签名，并通过 `apksigner` 校验证书。
4. CI 生成版本化 APK、latest APK 和 `latest.json`，再运行 `scripts/verify-android-release.mjs` 校验文件大小及 SHA-256。
5. 机器人只提交 `apps/web/public/downloads/android/` 发布资产。
6. Android 工作流提交资产后显式触发 `Deploy Production` 的 `web` 模式（GitHub 内置令牌产生的 push 不会递归触发普通 push 工作流）。
7. Web 健康检查通过后执行规定的 Docker 清理。

Android 源码和 Android 专项工作流由生产分类器限制在 `web` 范围，不触发 API 或数据库迁移；生成后的下载资产同样只进入 Web 部署。这避免客户端发布误走完整数据库部署。

## 首次配置固定签名

用 JDK `keytool` 在安全工作站创建专用发布 keystore。该 keystore 必须安全备份，丢失后现有安装无法覆盖升级。

在 GitHub `production` environment 配置：

- `ANDROID_KEYSTORE_BASE64`：keystore 文件的单行 Base64。
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

当前内部发布证书使用 PKCS#12；CI 显式以 `storeType=PKCS12` 加载。正式应用商店签名应使用另一套密钥。

仓库不得提交 keystore、`signing.properties` 或密码。四项中任意一项缺失时，CI 必须停止，不能退回临时签名。

## 版本发布

每次发布前同时增加 `android-app/app/build.gradle.kts` 中的：

- `versionCode`：严格递增整数，Android 用它判断升级。
- `versionName`：用户看到的语义版本，如 `1.0.1`。

可在 GitHub Actions 手动触发工作流并填写版本说明，也可随 Android 源码推送自动触发。

## 本地构建

调试包：

```bash
pnpm android:build:debug
```

正式包必须先在 `android-app/signing.properties` 配置本地 keystore，格式见 `android-app/signing.properties.example`：

```bash
pnpm android:build:release
```

## 安装与升级

- 首次安装：登录后的客户端下载页下载 APK，并按 Android 提示允许当前浏览器安装应用。
- 应用内升级：APP 启动时读取同一份 `latest.json`；版本较新时提示下载，校验 SHA-256 后打开系统安装页。
- 固定签名不变时可直接覆盖安装，用户登录会话和本地设置保留。
- APP 不绕过无效 TLS 证书，也不允许明文 HTTP。

## 回滚

恢复上一版 APK 与对应 `latest.json` 的提交并走 Web 级部署。Android 不允许把较低 `versionCode` 直接覆盖较高版本；已安装高版本的设备可继续使用 Web 业务，需要真正降级时必须卸载后重装。因此通常应修复问题并发布更高 `versionCode`，而不是让用户降级。

## 验收

- CI：release 构建、签名校验、版本校验、SHA-256/大小校验通过。
- Web：登录后桌面和 390px 视口都能看到入口，版本页正确展示并能下载。
- 真机：登录、返回键、拍照、相册、定位、文件上传、下载、首次安装和覆盖升级逐项验证。
