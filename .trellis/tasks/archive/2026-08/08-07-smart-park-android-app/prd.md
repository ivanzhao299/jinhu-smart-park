# 智慧园区 Android APP 全链路发布

## Goal

为 `jinhu-smart-park` 提供可安装、可持续升级的 Android APP，使物业、工程部及园区管理人员可从手机桌面直接进入智慧园区移动工作台，并形成从源码、构建、签名、产物发布、应用内升级到生产部署与验收的完整链路。

## Confirmed Facts

- Web 端已经具备 PWA manifest、Service Worker、离线页面和 192/512/maskable 图标。
- 生产 Web 与 API 采用同源 `/api` 转发，适合使用轻量原生 WebView 壳承载现有登录和巡检业务。
- 仓库已有分级部署体系；Android 工程、构建工作流与发布资产属于发布基础设施变更，应安全归入完整部署或独立 Android 发布链，不能误判成 CSS/Web 轻部署。
- 当前仓库没有 Android Gradle 工程、APK/AAB 产物、Android 固定签名、应用版本清单或应用内升级服务。
- 当前工作区已有工程巡检功能的未提交改动，Android 任务必须避免覆盖或重置这些改动。

## Requirements

- 新增原生 Android 壳，最低支持 Android 7.0，并以生产智慧园区地址作为默认入口。
- APP 首屏、状态栏、返回键、文件/相机上传、定位、下载、外链、网络异常与会话持久化应符合现场巡检使用场景。
- APP 应优先进入适合当前身份的移动工作入口，同时保留完整管理后台访问能力。
- 使用稳定 applicationId、版本号和可重复签名；内部升级版本必须可覆盖安装。
- CI 能自动构建 release APK，并产出版本化 APK、latest APK、SHA-256 和机器可读 manifest。
- 生产端提供受控的最新版本查询与 APK 下载路径；APP 启动后可检查升级、提示下载并交给系统安装。
- Android 发布资产变更必须接入现有分级部署分类、生产同步、健康检查和 Docker 清理规则。
- 文档必须说明本地构建、CI 构建、签名管理、生产发布、升级、回滚和首次安装步骤。
- 不提交真实生产秘密或正式商店私钥；内部签名与商店签名必须明确分离。

## Acceptance Criteria

- Android 工程能在 JDK 17/Android SDK 环境执行 release 构建。
- APK 可安装并打开生产登录页，登录后可操作工程/物业移动业务。
- Android 返回键优先执行 Web 页面回退，无法回退时再执行退出确认或系统返回。
- 拍照上传、相册选图、定位授权和 APK 下载具备对应 Android 权限与兼容处理。
- CI 在 Android 源码或构建工作流变化时自动构建、校验并发布产物及 manifest。
- `latest` manifest 的版本、哈希、文件大小与实际 APK 一致。
- 生产部署后可通过稳定 URL 获取 manifest 和 APK，旧版本 APP 能发现新版本。
- 部署分类测试覆盖 Android 源码、Android 发布资产和 Android 工作流路径。
- Android 专项检查、相关脚本测试、Web/API 受影响范围检查和文档检查通过。

## Out of Scope

- 本期不重写现有巡检、工单或物业业务为原生页面。
- 不在代码库保存 Google Play 或国内应用商店正式发布私钥。
- iOS 原生 APP 不在本任务范围。

## Open Question

- 无阻塞问题。首发渠道确定为园区内部 APK 分发；下载入口放在登录后的“客户端下载”页面，不做应用商店上架。
