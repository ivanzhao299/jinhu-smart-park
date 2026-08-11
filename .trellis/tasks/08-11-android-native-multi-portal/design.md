# Android 原生多门户客户端技术方案

## 1. 推荐形态

采用“一个 APP、一个身份体系、两个业务门户、一个服务端权限事实源”。不建议首期拆成两个 APK：拆包会造成两套发布、签名、升级、埋点和兼容维护成本，而现有用户可能同时拥有员工与业主/租户权限。

登录成功后读取移动启动上下文，计算可用门户：

`登录 → 用户/园区上下文 → 移动能力清单 → 门户路由 → 功能模块 → API 服务端鉴权`

门户路由规则：

- 仅员工能力：直接进入员工端。
- 仅业主/租户能力：直接进入业主/租户端。
- 同时具备：首次选择并记忆，可在“我的”中切换。
- 无移动能力：展示联系管理员页面，不回退到完整管理后台。

## 2. Android 模块边界

- `app`：应用入口、导航、门户切换、版本升级。
- `core-auth`：登录、令牌刷新、安全存储、退出和会话恢复。
- `core-network`：统一响应解包、错误映射、园区上下文、幂等键、重试。
- `core-permission`：能力清单、门户判定、页面/动作门禁；不承载最终授权。
- `core-designsystem`：品牌、组件、状态页、表单和无障碍规则。
- `core-data`：Room 缓存、离线草稿、上传队列、同步状态。
- `core-media`：CameraX、相册、压缩、预览、断点/重试上传。
- `core-location`：定位授权、精度、手工位置兜底。
- `feature-employee-*`：员工首页、巡检、工单、隐患、消息、我的。
- `feature-owner-*`：业主首页、服务申请、进度、通知、评价、我的。
- `feature-web-fallback`：迁移期受白名单控制的低频页面，不进入核心导航。

## 3. 服务端契约

现有 `/users/me` 继续作为基础授权上下文。为减少移动端多请求拼装，建议新增版本化 `GET /mobile/v1/bootstrap` 聚合接口，返回：

- 用户、当前园区、可访问园区；
- 可用门户 `employee` / `owner`；
- 服务端计算后的 capability code 列表；
- 首页卡片、快捷动作与未读数量；
- 客户端最低版本、功能开关和离线策略版本。

能力计算必须由共享清单映射既有 permission、module、data scope 与 field policy。所有业务接口继续独立校验权限；bootstrap 不是授权凭证。

建议新增或补齐：设备/推送令牌注册、消息收件箱、移动候选项、员工今日任务聚合、业主服务摘要、批量上传确认和离线同步回执。所有写操作使用幂等键或等价的业务去重键。

### 3.1 Bootstrap contract

建议响应保持版本化和显式能力，不直接把 Web 菜单翻译成 Android 导航：

```json
{
  "contract_version": "mobile-bootstrap-v1",
  "user": {},
  "current_park": {},
  "accessible_parks": [],
  "portals": ["employee", "owner"],
  "capabilities": ["employee.inspection.execute", "owner.service.create"],
  "home": { "cards": [], "unread_count": 0 },
  "client_policy": {
    "minimum_version_code": 1,
    "force_upgrade": false,
    "native_features": {},
    "web_fallback_allowlist": []
  }
}
```

`contract_version` 不兼容时客户端进入安全升级页，不猜测字段。`capabilities` 只决定客户端入口；API controller/service 仍使用既有权限、模块、scope 和 field policy。

### 3.2 P0 API delivery list

| API | 用途 | 服务端约束 |
|---|---|---|
| `GET /mobile/v1/bootstrap` | 门户、能力、园区、开关 | 已认证；字段策略；模块投影 |
| `POST /mobile/v1/devices` | 注册设备/推送令牌 | 当前用户；设备唯一性；可撤销 |
| `GET /mobile/v1/employee/today` | 今日巡检、工单、待办聚合 | self/data scope；模块过滤 |
| 现有巡检 execution/action API | 巡检开始、保存、提交 | 精确动作权限；幂等；状态锁 |
| 现有 workorder API | 接单、到场、完成、确认 | 精确动作权限；生命周期校验 |
| `GET /mobile/v1/owner/summary` | 我的请求与未读摘要 | 只能看到身份关联的请求 |
| 现有 workorder create/detail | 业主服务创建和进度 | source=`tenant_request`；字段裁剪 |
| 候选项 API | 字典、企业、楼栋、楼层、房屋/位置 | 与写侧解析一致；分页/搜索 |
| 现有 files API | 图片上传、预览与业务绑定 | MIME、大小、biz_type/biz_id 校验 |
| `POST /mobile/v1/sync/receipts` | 离线写入确认与去重 | client mutation id；幂等回执 |

### 3.3 Capability manifest

P0 capability 至少包括：

- `employee.home.view`
- `employee.inspection.view` / `employee.inspection.execute`
- `employee.workorder.view` / `employee.workorder.accept` / `employee.workorder.start` / `employee.workorder.finish`
- `employee.hazard.create`
- `owner.home.view`
- `owner.service.create` / `owner.service.view` / `owner.service.confirm` / `owner.service.evaluate`
- `common.notification.view`

共享 manifest 记录每个 capability 所需的 permission、module、portal 和数据范围语义；API 对映射做 contract test，Android 只消费 code。

## 4. 核心用户流程

### 员工端

首页只保留“今日任务、扫码/拍照上报、我的待办”三个一级动作。巡检执行页按单任务呈现：任务信息自动带入，检查项下拉选择，异常时才展开说明和照片，底部固定“暂存/提交”。工单采用“接单/到场/完成”状态动作，权限不足的动作不出现。

### 业主/租户端

首页只保留“我要报修/服务、查看进度、园区通知”。创建请求时服务类型、项目/楼栋/位置、联系人从候选项选择，照片优先，文字说明可选；详情以时间线显示受理、处理、完成和确认。

## 5. 离线与媒体

- 文本与选择项先写本地草稿，再异步上传。
- 照片压缩后进入独立队列，记录业务 ID、文件哈希、重试次数和状态。
- 网络恢复由 WorkManager 同步；冲突时展示服务端最新状态，不静默覆盖。
- 园区切换后仅展示当前上下文数据；未提交草稿明确标注所属园区。
- 定位拒绝或弱信号时允许选择标准位置并说明原因。

离线状态机统一为 `DRAFT → QUEUED → UPLOADING → SUBMITTED`，失败进入 `RETRYABLE` 或 `BLOCKED`。同一 `client_mutation_id` 在服务端只能产生一次业务结果；照片先取得文件 ID，业务提交仅引用已完成文件。退出登录时未提交草稿默认保留在该账号加密分区，其他账号不可见；账号禁用或管理员远程清除时删除。

## 6. Navigation And UX Contract

- 员工底部导航：`首页 / 任务 / 消息 / 我的`；首页只展示今日任务、快速上报、我的待办。
- 业主底部导航：`首页 / 服务 / 消息 / 我的`；首页只展示我要报修、查看进度、园区通知。
- 业务详情使用单向层级导航和系统返回，不复刻 Web 顶栏、侧栏或多级菜单。
- 主按钮固定在安全区底部；同一页面最多一个强调色主动作。
- 所有枚举、位置、人员和项目优先使用候选列表；仅标题补充或异常原因允许短文本。
- 拍照后立即显示缩略图、上传状态和失败重试；上传中不能静默提交缺图结果。

## 7. 迁移、发布与回滚

- v2 与现有 v1 WebView 客户端并行；同一签名、package id 和升级链可原地升级。
- 功能按远程开关逐模块原生化：基础壳 → 员工巡检/工单 → 业主服务 → 通知/离线增强。
- APK 源码变化走 Android 专项构建；纯客户端资产发布不触发数据库迁移。
- 新增 API 但无迁移时走 API 级部署；存在 schema/migration 时走完整二级部署并备份、迁移、健康检查和 Docker 清理。
- 严重故障时关闭对应原生 capability，恢复白名单 Web 页面或保留旧版服务；Android 不依赖降低 `versionCode` 回滚。

## 8. 关键取舍

- 选择 Compose 而非继续 XML：适合建立统一原生设计系统和模块化导航，但团队需要补齐 Compose 测试能力。
- 选择服务端能力清单而非客户端角色硬编码：权限调整即时生效，代价是需设计稳定的版本化 capability contract。
- 首期保留有限 Web 兜底：降低一次性迁移风险，但必须设置移除期限，避免永久混合架构。

## 9. 可观测与安全

- 记录不含个人敏感信息的启动、登录、页面错误、同步失败和任务漏斗事件。
- 建立 crash-free、ANR、API 错误率、上传成功率、任务完成时长和离线队列积压指标。
- access/refresh token 使用 Android Keystore 支持的加密存储；日志不得输出 token、密码、手机号全文或照片 URL 签名。
- 权限撤回、账号禁用和园区切换触发本地敏感缓存清理。

## 10. Environment And Release Channels

- `internal`：开发/测试环境，允许调试日志，不使用生产账号。
- `pilot`：生产 API、试点 feature flag、正式签名，限白名单用户。
- `production`：正式签名、正式下载 manifest、灰度比例控制。
- 三个渠道使用不同应用展示名或明显环境标识；签名、applicationId/升级兼容策略在首次实现前冻结。
- 每次发布生成 APK、版本化 APK、SHA-256、SBOM/依赖清单和 `latest.json`；生产只接受 CI 产物。
