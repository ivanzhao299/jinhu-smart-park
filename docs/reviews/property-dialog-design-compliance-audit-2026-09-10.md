实施证据与最新状态见 [.trellis 实施验证记录](../../.trellis/tasks/09-10-property-dialog-design-compliance/research/implementation/validation.md)。以下原调查矩阵保留为修复前证据。

## 2026-09-10 已批准审核决定（优先于下方历史规划）

主助手已实际复核报告、CSS/Parts 和 primary-390.png，批准 G1+G2：D01/D02/D03/D05/D06。保留 native dialog/showModal、closed 隐藏、锁/幂等指纹/API/payload/权限/审批和金融语义；原因 trim 2–500，民宿未到店/遗失 busy/error 接入，占用释放局部错误+false。
G3 不批准：保留取消清空原因契约，失败保留有效输入，取消不重置 caller 原表单。G4/G5 不批准额外确认或 leasing 批量迁移，登记为非违规建议，不算漏项。D11 必做代表回归，仅证实与本共享改动相关回归时最小修复留证；D12 不改。
授权激活、正常分支实现、Issue/PR、必要 PR CI/Release Smoke 全通过后 squash merge；核验精确 main SHA 的 CI/自动 Deploy 与清理后归档。禁止豁免、force push、手动生产操作或修改他人环境。
验收必须分开 mock 前端与隔离真实 API/DB：原路径唯一申请回读、执行前配置未变，以及修改 caller 代表失败/成功；1440/390、焦点/Escape/busy/回焦、短屏/200% 重排、复杂长内容及可构造错误分级。必要验收受阻保持未闭环。
Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/732
基线核对：HEAD = fetched origin/main = 563af3a1890b89166f664dd5427e47267ae90b7e；本 worktree 仅既有专项未跟踪工件；COST_GUARD 延续，未重扫145文件。

# 房产弹窗与审批交互规范专项审查

日期：2026-09-10。状态：**调查完成，planning 待主助手复核；未批准实施**。

## 1. 基线、范围与证据边界

- 已执行 `git fetch origin main`，固定审查 SHA：`563af3a1890b89166f664dd5427e47267ae90b7e`。
- 分支：`codex/property-dialog-audit-20260910`；隔离 worktree：`/home/jinhuit/JinHuCodebase/jinhu-smart-park-property-dialog-audit`。
- 原 worktree 仍在 `codex/archive-issue-721-hcd-final`（`82ceca79`）；另两个既有 worktree 未操作。没有提交、push、合并、部署、迁移、容器操作或产品代码改动。
- 启动时主工作树干净，但进程观测存在多个 Codex / chrome-devtools，不能沿用“无运行中 Codex”的旧判断。没有连接主 Chrome、读取他人会话或终止其进程。
- 本次单 agent。一次性检索 145 个 `.ts/.tsx/.css` 非测试源文件：共享 `components/property`、`features/property-shared`、`app/homestay`、`app/housing`、`app/leasing`、`app/assets/property-operations`。关键词与逐文件清单见任务 `research/scan-scope.json`；原始命中分别保存在 `scan-native.txt`、`scan-overlay.txt`、`scan-approval.txt`。这是语法关键词普查加定向调用链核验，不是 AST/运行时全路径覆盖。
- 定向补读 UI 包、表单/抽屉成熟案例，以及模式切换 controller / DTO / service / policy adapter。HR 不在调查和修改范围。
- 用户截图未可靠传入；下面图片均为**本轮独立 Chromium 生成**，不描述或还原用户截图。
- 证据分级：**S** 固定 SHA 源码/规范；**B** 固定源码真实 Next 路由 + 独立浏览器 + mock API；**R** 独立真实后端/数据库全链路。本轮有 S、B，**没有 R**。
- 浏览器使用 1440×900、390×900；所有 `/api/**` 在浏览器内拦截，身份、房源、订单、租约、错误及成功响应均为虚构夹具。品牌读取使用空对象式兜底，不能据此评价真实租户品牌。Next 的 API target 指向本地关闭端口，未接触生产/共享 API。没有通过 fixture 绕过产品源码权限检查，但模拟全权限账号不构成权限验收。

## 2. 规范表与可复用能力

“仓库明文要求”“现有组件契约”“本轮建议”分开处理，不把个人视觉偏好写成既有硬规则。

| 编号 | 具体规范 / 契约 | 固定 SHA 出处 | 本轮适用含义 |
|---|---|---|---|
| N1 | 使用共享 DS 与 UI primitives；页面局部样式只做领域组合，不重建颜色/按钮/面板体系 | `AGENTS.md:88`；`.trellis/spec/web/frontend/index.md:344`、`:410`；`docs/frontend-ui-standards.md:3` | 在已有共享组件上补全布局与 token，不新建审批框架 |
| N2 | 新表单使用 `.field` / `.form-field`；校验文案使用 `.field-error` / `.ds-field-error`；沿用表单 token | `docs/frontend-form-drawer-audit-20260624.md:31`；`apps/web/app/globals.css:6373`、`:6400` | 原生 textarea 可以使用，但必须接共享字段/反馈样式 |
| N3 | 抽屉使用 Drawer/Header/Form/Section/Grid/Footer；传 onClose，关闭入口和滚动区统一 | `docs/frontend-ui-standards.md:62`；`packages/ui/src/components/Drawer/Drawer.tsx:27`；`packages/ui/src/components/Drawer/Drawer.module.css:1`、`:277` | 复杂多字段编辑复用 Drawer，不能拿它替换所有已有模态确认 |
| N4 | 固定抽屉打开时，错误在抽屉内以 role=alert 呈现；编辑/换对象/关闭清理错误；成功在关闭后由页面反馈 | `.trellis/spec/web/frontend/index.md:422` | 对确认框的相应契约另见 N5；不接受遮罩后错误作为可见反馈 |
| N5 | ConsequenceDialog 必须有稳定对象、后果、执行后状态、原因策略；失败由 caller 的 errorMessage 在模态内显示；使用 native dialog / showModal、取消、焦点回归与 44px 触控 | `apps/web/features/property-shared/README.md:30`；`dialog/ConsequenceDialog.tsx:38`、`:249`、`:276`（路径前缀为 `apps/web/features/property-shared/`）；`dialog/dialog-contract.spec.ts:23` | `<dialog>` 是明确选用的共享方案，不属于应清理的原生 prompt/confirm |
| N6 | 前端约束表达 required/min/max/step 并匹配 DTO；后端仍独立校验 | `AGENTS.md:105`；`.trellis/spec/web/frontend/file-upload-and-form-controls.md:165`；`apps/api/src/modules/property-operations/dto/transition-operating-mode.dto.ts:5` | 切换原因应 trim 后 2–500 字，目标模式只取合法 enum |
| N7 | 真实业务路由需桌面、手机、键盘、焦点、ARIA、重排等证据；静态测试不是视觉验收 | `AGENTS.md:88`、`:96`；`.trellis/spec/web/frontend/index.md:496`；`apps/web/features/property-shared/README.md:54` | 必须对真实页面操作；mock 与真实后端证据独立记录 |
| N8 | UI 包只放通用展示，不放业务 API/权限；property-shared 不执行审批，不导入领域 API | `.trellis/spec/ui/frontend/index.md:5`；`.trellis/spec/ui/frontend/component-guidelines.md:19`；`apps/web/features/property-shared/README.md:36` | 对象/金额/模式摘要和提交由业务 caller 提供 |
| N9 | 关闭或换目标清空原因；false 保持打开；single-flight 阻止同 tick 重复；异常会向 caller 传播 | `apps/web/features/property-shared/dialog/dialog-state.ts:15`、`:47`、`:70`；`dialog/dialog-state.spec.ts:17` | 当前关闭清空是既有契约；保留输入属于需审核的行为调整 |
| N10 | 共享 UI CSS modules 使用全局 token；优先扩展已有组件避免复制 | `.trellis/spec/ui/frontend/component-guidelines.md:19`；`.trellis/spec/guides/code-reuse-thinking-guide.md:19` | 居中、间距、footer、换行在 ConsequenceDialog 自身最小修复，不改全局 reset |

**Modal / Form 实际供给**：`packages/ui/src/index.ts:1` 没有导出名为 `Modal` 或通用 `Form` 的组件；实际有 `DrawerForm`。property-shared 导出 `ConsequenceDialog`、`CanonicalDetailShell`。业务表单还使用 `<form>`、`HousingFormPrimitives`，不能假设系统已有另一个统一 Modal/Form 框架。Ant Design 虽是依赖，目标链并未使用它，不应为此切换技术体系。

**成熟接入案例（仅说明结构/行为可复用，并不宣称所有视觉已通过）**：

- `apps/web/app/assets/units/components/UnitFormDialog.tsx:54`、`:114`：Drawer/Header/Form/Grid/Footer、表单内错误、保存状态；适用于复杂编辑布局，不证明其嵌套键盘行为无缺陷。
- `apps/web/app/homestay/_components/HomestayDetailClient.tsx:295`：入住/退房已经接 `busy`、`errorMessage`、明确对象与后果。
- `apps/web/app/housing/_components/HousingLeaseDetailClient.tsx:44`、`:116`：锁、原因、弹窗内错误；成功与后续刷新失败分离。财务例 `HousingFinanceActions.tsx:121`、`:182` 同样保留原始表单，失败返回 false。
- `apps/web/app/leasing/checkouts/page.tsx:528`、`:880`：结算/退租生效已用 ConsequenceDialog，附加日期/意见字段，弹窗内反馈；不能再笼统说 leasing 退租全用 prompt。

## 3. 用户原路径的真实调用链

| 层 | 路由/操作 | 实际组件、状态及调用 | 出处 |
|---|---|---|---|
| 列表 | `/assets/property-operations` → 查看详情 | PropertyControlPlaneGuard → PropertyFoundationListClient → 共享响应式记录/Link | `apps/web/app/assets/property-operations/page.tsx:1`；`apps/web/components/property/PropertyFoundationControlClient.tsx:541` |
| 详情 | `/assets/property-operations/[unitId]` | PropertyFoundationDetailClient；GET `/property/units/:unitId/operation`；PropertyPageSurface/PanelSurface | `apps/web/app/assets/property-operations/[unitId]/page.tsx:1`；`PropertyFoundationControlClient.tsx:653`（同上目录） |
| 申请表单 | 详情中“申请经营模式切换”面板 | **页面内** select `target_mode`，非打开另一层表单；同模式、busy、canRequestTransition=false 禁止提交；两层 PermissionGuard | `PropertyFoundationControlClient.tsx:903` |
| 审批配置 / 预览 | 点击“提交切换审批”前后 | 无前端选审批人、流程配置、预览请求或第二个 Modal。仅展示原模式→目标模式、等待审批和阻断复核说明 | `PropertyFoundationControlClient.tsx:910`、`:919` |
| 提交确认 | 标题“申请经营模式切换”，按钮“提交审批” | ConsequenceDialog → native `<dialog>.showModal()`；原因 textarea、内置 form、共享 ds-button；不是 window.prompt/confirm | `PropertyFoundationControlClient.tsx:919`；`features/property-shared/dialog/ConsequenceDialog.tsx:58`、`:249` |
| 请求 | POST `/property/units/:unitId/mode-transitions` | body `{target_mode, reason}`；幂等 key 按目标模式+原因指纹复用；无新 API | `PropertyFoundationControlClient.tsx:849` |
| 后端审批配置 | 创建申请 | controller 有 IdempotencyInterceptor；DTO 2–500 字；service 重建阻断快照并 createPendingRequest，policy adapter 冻结一阶段、requiredCount=1、候选/排除规则 | `apps/api/src/modules/property-operations/property-operations.controller.ts:47`；`property-operations.service.ts:367`、`:394`；`property-foundation-approval.adapter.ts:54`、`:107` |
| 反馈 | 失败/成功 | 失败 setTransitionFeedback + return false，errorMessage 在框内，输入保留；成功关闭、页面提示并 reload。未使用响应中的 requestId 导航；reload 自身捕获错误，需验收刷新失败时不要重复提交 | `PropertyFoundationControlClient.tsx:867`、`:880`、`:923` |
| 后续审批 | `/property/approvals/[requestId]`；模式切换记录列表 | 独立审批详情页与审计详情，非提交前预览。决定和执行状态分离 | `apps/web/components/property/PropertyApprovalClient.tsx:98`、`:148`；`PropertyFoundationControlClient.tsx:545` |

产品前端本轮不得伪造未提供的审批人/阶段预览。可以用现有数据说明“提交申请，执行后再改变模式”；真实策略由服务端冻结。

## 4. 问题矩阵

P1 表示优先修复的可见交互缺陷，P2 表示约束/体验问题。“建议/待验证”不能计为已经违反明文规范。

| ID / 证据 | 路由与操作 | 发现、具体规范关系 | 文件行号 | 可复用组件 / 风险 |
|---|---|---|---|---|
| D01 / P1 / S+B | 原路径；民宿未到店；housing 租约作废；全部同组件消费者 | 框体贴视口左上，1440 下 x=0,y=0,w=576；390 下 x=0,y=0,w=358，padding=0。全局 `*` reset 覆盖 dialog UA margin/padding，组件只声明尺寸/overflow，没有恢复定位和内容间距。违反 N1/N2 的共享间距继承要求；“居中”是本轮选定的建议呈现方式，仓库未另行规定像素坐标 | `apps/web/app/globals.css:411`；`apps/web/features/property-shared/dialog/ConsequenceDialog.module.css:1`；`ConsequenceDialog.tsx:252` | 原位扩展 ConsequenceDialog CSS；禁止修改全局 reset 或重新造 Modal。改共享组件需回归所有消费者 |
| D02 / P2 / S+B | 全部有原因的 ConsequenceDialog | ReasonField 外层裸 div 未接 `.field/.form-field`；footer 无 ActionGroup/ds-action-bar 布局；error 用 `form-error`，globals 无对应定义，现有为 field-error/ds-field-error；native dialog color 为黑色，未明确继承文本 token。N1/N2/N10；这不是“CSS 文件没加载”：尺寸和圆角已生效 | `apps/web/features/property-shared/dialog/ConsequenceDialogParts.tsx:24`、`:108`；`ConsequenceDialog.tsx:277`；`apps/web/app/globals.css:6400` | 共用字段/按钮/错误 primitive 与 token；保留 role=alert。不要额外加一套 input/button 样式 |
| D03 / P2 / S+B | 原路径 → 切换原因 | caller 只传 minLength=2，无 maxLength=500；实测 501 字可输入且 checkValidity=true。与 N6 / DTO 不一致，后端仍拒绝，不能认定后端安全失效 | `apps/web/components/property/PropertyFoundationControlClient.tsx:934`；`apps/api/src/modules/property-operations/dto/transition-operating-mode.dto.ts:12` | 复用 reasonPolicy.maxLength；500 边界、空白 trim、错误关联测试 |
| D04 / 调整待复核 / S+B | 原路径及同类原因框 → 取消/Escape→重开 | 原因清空，target_mode 保留。符合 N9 当前测试，却不满足本专项拟议“取消保留输入”。不得把它写成旧实现违反现有规范 | `apps/web/features/property-shared/dialog/dialog-state.ts:15`；`dialog-state.spec.ts:17`；`PropertyFoundationControlClient.tsx:925` | 在原组件上增加显式受控草稿/可选保留机制；默认保留现有语义。草稿按对象+动作+版本隔离，换对象/成功清空，防跨操作泄漏 |
| D05 / P1 / S+B（未到店），S（遗失） | `/homestay/stays/[stayId]` → 登记未到店 / 登记凭证遗失 | 子调用未接 busy 和 errorMessage；实测提交中按钮仍为确认文本；失败框内 alert=0，页面遮罩后有错误。N5 失败反馈契约未接入。已有父 lock 与 dialog single-flight，**不能声称没有防重复** | `apps/web/app/homestay/_components/HomestayStayActions.tsx:34`、`:111`、`:135`；`HomestayDetailClient.tsx:75`、`:154`、`:220` | 从父 mutation 传 busy/error 至已有框；失败 false、原因保留。需验证 busy 时取消/Escape不会提前关闭，409 不因冲突壳卸载导致丢稿 |
| D06 / P1 / S | `/assets/property-occupancies/[occupancyId]` → 释放人工锁房 / 申请强制释放 | release catch 只 setFeedback 后 throw；ConsequenceDialog 没有 errorMessage，页面反馈被 modal 遮挡，onSubmit void promise 的异常缺少界面处理。N5 漏接，N4 同类反馈原则 | `apps/web/components/property/PropertyFoundationControlClient.tsx:686`、`:707`、`:768`；`apps/web/features/property-shared/dialog/ConsequenceDialog.tsx:264` | caller 单独 dialogError，失败 return false；不修改释放/审批权限或审计语义。共享组件不吞异常伪报成功 |
| D07 / 一致性建议 / S | `/property/approvals/[requestId]`、`/homestay/tasks`、`/housing/tasks` → 批准/驳回/撤回 | 当前为页面/记录内原因与按钮，直接执行。不是自绘浮层，也没有原生 prompt。详情缺少可读业务对象和前后状态的单次确认摘要；N5 是复用目标，但现有规则未规定所有页内动作都必须二次弹窗 | `apps/web/components/property/PropertyApprovalClient.tsx:119`、`:148`；`PropertyRuntimeSlots.tsx:228`、`:335` | 可将真正高风险决定接既有 ConsequenceDialog，保留 allowedActions、stage/version 和锁。先复核是否增加确认步骤及现有返回字段能否提供可读摘要 |
| D08 / 一致性建议 / S | `/homestay/bookings/[bookingId]` 取消审批；`/homestay/finance` 退款/减免审批 | 采用页内 form；已有必填原因、财务来源/金额限制和“审批前不写流水”说明。不可直接判定违规。与 housing 的二次后果确认不一致，可统一高风险入口 | `apps/web/app/homestay/_components/HomestayDetailClient.tsx:288`；`HomestayFinanceEntryPanel.tsx:120`、`:139` | ConsequenceDialog 仅承接确认；保留 form、来源/金额校验及业务 wrapper。普通收款/登记不额外弹确认 |
| D09 / P2 候选 / S | `/leasing/contracts` 提交/批准/驳回/作废 | 原生 prompt/confirm，驳回分两次 prompt；第一步取消被当作“原因必填”，缺少可保留的编辑表单与统一对象/结果摘要。N1/N2 是迁移规则，**不是原生弹窗绝对禁令** | `apps/web/app/leasing/contracts/page.tsx:999`、`:1020`、`:1027`、`:1039` | 复用 ConsequenceDialog + children 中独立意见字段；保留 opinion/reject_reason 语义，不能合并后丢字段；金融/合同状态风险高 |
| D10 / P2 候选 / S | `/leasing/checkouts` 提交/批准/驳回；`/leasing/contract-changes` 提交/批准/驳回/生效 | 原生 prompt 收意见/原因；关闭后异步错误留页面，已有 Drawer 场景要验收可见性。N1/N2/N4 作为改造门槛，不能把所有操作已确认是遮挡错误 | `apps/web/app/leasing/checkouts/page.tsx:479`；`apps/web/app/leasing/contract-changes/page.tsx:385` | 复用既有退租 ConsequenceDialog 模式；保留财务预览与原 action body，不改结算/生效条件 |
| D11 / 嵌套风险待验证 / S | leasing Drawer 上再开共享确认；未来采用两层表单/确认 | Drawer 在 document 监听 Escape，不判断 topmost modal；ConsequenceDialog 自己处理取消；可能同时关父层，尤其 busy 时。未在本轮真实嵌套路由触发，不能写为已复现 | `packages/ui/src/components/Drawer/Drawer.tsx:41`；`apps/web/app/leasing/checkouts/page.tsx:741`、`:880` | 复用既有层，先做独立交互证明；确认问题后仅加 topmost/关闭协调，不全仓重构 Drawer |
| D12 / 不列为违规 / S | `CanonicalDetailShell presentation=drawer` | 使用 native modal dialog；其 CSS 只有 touchTarget，未定义抽屉尺寸。目标域本次查看的详情为 full；没有证据证明目标生产路线走该 drawer 分支 | `apps/web/features/property-shared/detail/CanonicalDetailShell.tsx:106`；`CanonicalDetailShell.module.css:1` | 留作共享壳兼容风险；不因定义存在就声称生产已坏、不扩大本轮修改 |

**正确接入/非问题**：housing 租约/财务/采购均已使用共享确认（租约 B 已验证、其他 S）；其 children 内 `role=alert` 是合法接入，不强行把未使用 errorMessage prop 判为漏接。原路径的 mode 前→后摘要、等待审批说明、失败保留输入、busy、Escape 和 retry key 已有证据，不重写。原生 select/date/number/checkbox/`details` 是受支持的表单能力；离页保护 `useDirtyLeaveGuard.ts:39`、`:86` 及 beforeunload 有不同目的，本轮保留。

## 5. 一次性普查清单补充

native 共 28 个代码行：共享 dirty-leave confirm 2 行，leasing 26 行；没有 alert 命中。共享控制面、homestay、housing 中未命中 prompt/confirm/alert。overlay 关键词 36 行，审批关键词 298 行；关键词命中数不等于问题数。

下面是 D09/D10 以外的 leasing 原生入口，均作**登记项**，不自动纳入修复，也不统一定性违规。完整文本见 `research/scan-native.txt`。

| 路由 / 操作 | `apps/web/app/leasing/` 下位置 | 分类、复用与风险 |
|---|---|---|
| contracts 删除、移除房源、标记生效 | `contracts/page.tsx:925`、`:974`、`:1099` | confirm 已有对象/部分后果；生效是高风险候选，可复用 ConsequenceDialog；合同/房源状态联动不可改 |
| lead-pool 领取 | `lead-pool/page.tsx:142` | 普通确认，保留；无证据证明需升级审批框 |
| receivables 删除；payments 删除 | `receivables/page.tsx:376`；`payments/page.tsx:323` | 保留原有财务软删/活动阻断；不能借 UI 专项扩大删除范围 |
| checkouts 删除；contract-changes 删除 | `checkouts/page.tsx:458`；`contract-changes/page.tsx:345` | confirm 登记；可后续依对象与后果适配，仍需状态条件 |
| tenants 企业/联系人/资质删除 | `tenants/page.tsx:960`、`:1000`、`:1072` | 普通维护确认登记，低优先；不与审批强行合并 |
| leads 删除/移公海/跟进删除/看房删除/报价删除/报价驳回 | `leads/page.tsx:829`、`:840`、`:957`、`:1029`、`:1069`、`:1105` | 删除 confirm 不直接定性；原因/驳回 prompt 可复用原因字段，是否并入需先核实产品范围 |
| invoices 删除 | `invoices/page.tsx:316` | 金融删除风险，原检查保留；本轮不改 |

目标模块的浮层命中均为共享 ConsequenceDialog、Drawer 或 CanonicalDetailShell；没有在上述范围命中新增 page-local fixed/modal/backdrop 实现。范围外组件、运行时拼接名称和第三方 portal 不由这一否定结论覆盖。housing 的 `ActionDetails` 是原生 details 页内展开（`HousingFormPrimitives.tsx:4`），民宿和共享审批页的 inline panel 也不是自绘模态框。

## 6. 最小统一修复分组（尚未实施）

| 组 | 建议范围 | 方案与禁止事项 | 门槛 |
|---|---|---|---|
| G1 必修 | D01/D02，共享 ConsequenceDialog 三文件 | 保留 native showModal/top layer。CSS module 明确 `margin:auto`、安全视口间距、内部 grid/gap/padding、文本 token、长 ID/中文换行；原因接 `.form-field`，错误接 `.ds-field-error`，footer 复用 ds-action-bar/ActionGroup 语义。明确 closed display，不让新 display:grid 使关闭框可见；不改全局 reset，不换 antd、不新增 Modal 框架 | 先复核桌面居中+手机安全边距方案；全部共享消费者代表回归 |
| G2 必修 | D03/D05/D06，模式切换与反馈接入 | 2–500 reasonPolicy；民宿子层传 busy/error；占用释放局部错误+false，不抛出未处理 Promise。保留现有锁、幂等 key/指纹、API 和权限；开新动作/改字段清旧错误；失败留输入，成功后页面播报，刷新失败单独提示 | 400/403/409/网络错误；busy 两次点击和 Escape；返回值一致 |
| G3 需行为复核 | D04，取消保留输入 | 推荐在已有 ConsequenceDialog 增加可选受控 reason/draft 入口，由调用方按对象+动作+版本维护；保留默认“关闭清空”。本次选定入口取消只退出确认，回到已有表单且保留值；成功/换对象/离开作用域清空。不把业务草稿塞进通用 UI package | 现有清空契约测试保持；新增 opt-in 测试；同 ID 不同动作不得串原因 |
| G4 需范围复核 | D07/D08，高风险页内审批 | 优先统一民宿取消/退款减免，再评估共享批准/驳回/撤回。确认摘要含可读对象、动作、当前→申请后的状态、金额/来源/日期等现有值。当前前端无审批预览 API，因此仅做现有数据摘要，不展示猜测审批人 | 需要主助手确认额外一步的交互成本；普通低风险操作保持页内提交 |
| G5 需范围复核 | D09/D10 与 D11 嵌套 | 只迁移合同/变更/退租审批意见输入，复用共享框 children，不修改 payload。复核实际父抽屉层叠，再按证据处理 topmost Escape / focus-return /滚动。其他 leasing 原生登记项不默认扩展 | 合同、结算、付款副作用要用独立真实后端证明未改变 |

表单校验在提交前完成；锁必须同步生效，busy 期间禁重复确认、取消和 Escape；异步结果按目标身份核对，旧对象请求不得关闭新对象弹窗。失败返回 false 并在当前模态内播报、保留所有有效输入；取消回到原表单；提交成功清稿，再刷新。客户端锁不等于服务端幂等，本轮不改服务端契约。

键盘/层叠：保留焦点圈、Tab/Shift+Tab 循环、Escape 只关闭最上层、关闭后返回仍存在的触发点（否则回到合理标题）。内部滚动、footer 可达、390px/短高度/200% 重排、安全区、长对象标识换行需实测。现有测试里的 autofocus=取消不能代替真实初始焦点断言：本轮原路径初次打开观测聚焦标题，具体初始焦点策略也需在复核后明确。不自动删除理由必填等原业务约束。

## 7. 验收矩阵与本轮实测

图片与 JSON 在 `.trellis/tasks/09-10-property-dialog-design-compliance/research/`。所有 B 测试都在**真实前端业务路由**操作，未搭建替代演示页。

| 路径/交互 | 本轮桌面 1440 | 本轮 390 | 修复后要求 / 真实后端 R |
|---|---|---|---|
| 用户原路径：列表→详情→选择目标→提交切换审批→确认框 | B 已执行；布局 FAIL | B 已执行；布局 FAIL | 两端实测，居中/安全边距/内边距正确；R 另验真实阻断与审批创建 |
| 原路径空原因、501 字、取消/Escape/重开 | 空原因禁用；501 合法（缺上限）；取消清稿 | 同左 | 2–500 trim；保留策略经审核；合法输入不丢失 |
| 原路径提交 loading→400 失败→重试成功 | B loading、模态 alert、失败留稿、同一 key 重试、成功关闭有证据 | 同左 | R 必须回读唯一申请；配置在执行前不变；成功/刷新失败分别显示 |
| 原路径键盘 | B Escape 关闭后回触发按钮；Tab 从末尾回 textarea、Shift+Tab 从 textarea 回确认 | 同左 | 增加初始焦点、busy Escape、防同 tick 双击及触发点被移除 |
| 民宿 `/homestay/stays/:id`→未到店→400 | B 布局 FAIL、框内错误缺失、busy 文案缺失 | 同左 | 传忙态/错误，失败不转终态；R 验版本/身份/权限约束 |
| 民宿凭证遗失、入住/退房、取消、退款减免 | S；未运行 | S；未运行 | 代表动作全部 B；高风险写 R、检查取消保留输入与原来源金额校验 |
| 长租 `/housing/leases/:id`→作废租约→400 | B 布局 FAIL；busy/错误/失败留稿正确 | 同左 | G1 后视觉复测；R 只建申请、不立即作废 |
| 长租财务退款/减免、采购付款/退款/转收费 | S；未运行 | S；未运行 | B 长内容/金额/日期/多条明细/取消原表单保留；R 审批与金融守卫 |
| 共享占用释放/强制释放 | S；未运行 | S；未运行 | B 拒绝/重复点击/成功/刷新失败；R 版本与占用效果 |
| 共享审批详情与工作台批准/驳回/撤回 | S；未运行 | S；未运行 | 若纳入 G4：B 原因/对象/状态摘要；R 决策与执行状态分离 |
| leasing 原生审批 + 已迁移结算/生效 + 父 Drawer 嵌套 | S；未运行 | S；未运行 | B 原始路由下父/子层 Escape、focus、内部滚动；R 金融/合同语义不变 |
| 横向溢出/滚动/长内容 | 原路径文档宽=1440 | 原路径文档宽=390 | 本轮短内容未横溢；wheel 后 scrollY 均0，但页面不一定有可滚动余量，**不能宣称滚动锁 PASS**；补长页、短视口、软键盘 |
| 13 项 dialog 状态/源码契约测试 | PASS 13/13 | 不适用 | 非视觉 PASS；新增的运行级断言必须能捕获本轮缺陷 |

代表图片：[原路径桌面](../../.trellis/tasks/09-10-property-dialog-design-compliance/research/primary-1440.png)、[原路径390](../../.trellis/tasks/09-10-property-dialog-design-compliance/research/primary-390.png)、[民宿失败390](../../.trellis/tasks/09-10-property-dialog-design-compliance/research/homestay-error-390.png)、[长租失败390](../../.trellis/tasks/09-10-property-dialog-design-compliance/research/housing-error-390.png)。均已实际查看。

## 8. 命令、限制与待决事项

已运行：fetch/固定 SHA/worktree 状态检查；一次性检索脚本；隔离 pnpm offline install（ignore-scripts）；Next dev `127.0.0.1:3417`；两份独立浏览器脚本；13 项定向测试；planning 引用/语法/diff 检查（结果见 research/validation.md）。

定向测试命令（在 apps/web）：

```sh
NODE_ENV=test TS_NODE_TRANSPILE_ONLY=true TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node","jsx":"react-jsx"}' node --test --require ts-node/register features/property-shared/dialog/dialog-state.spec.ts features/property-shared/dialog/dialog-contract.spec.ts features/property-shared/dialog/consequence-actions-adoption.spec.ts
```

跳过 lint/typecheck/build 全量门禁：本轮未改产品源码，处于 planning，不把现有运行证据替换为全库测试。修复后必须执行对应门禁。未运行真实 API/数据库验收、生产 smoke、部署、CI，也未添加豁免。R 验收需建立明确归属的 disposable 环境，参考 `docs/testing/property-approval-runtime-uat-entry.md:1`；本轮未启用审批 runtime、未借用他人容器。

环境尝试记录：首次安装受 NODE_ENV=production 影响仅装生产依赖；后续 dev 安装遇非交互确认未执行，显式关闭本地 modules purge 提问后离线安装成功（无 lockfile 变更、无 CI 改动）。浏览器首次路径写成 chrome-linux，修正为实际 chrome-linux64 后暴露缺 libnspr4/libnss/libasound；ldd 定向审计定位后，仅通过 LD_LIBRARY_PATH 只读使用现成提取库，启动独立 profile 成功。没有系统级安装，也没有重复修业务代码。

待主助手决定：

1. G1/G2 是否按报告直接进入修复；是否接受保留 native dialog 的居中/手机安全边距方案。
2. G3 “取消保留原因”采用 opt-in/受控方式及其精确清理范围；不要静默翻转全体消费者默认契约。
3. G4/G5 是否纳入同一闭环；建议先主路径与直接同类缺陷，再扩展审批意见输入，不把全部 leasing 原生确认强制替换。
4. 真实后端 R 的独立环境/fixture，以及最终初始焦点与长内容/footer 呈现标准。

本报告及任务保持 planning。**到此停止等待主助手复核；不执行 task.py start，不自行批准修复，不自动提交或合并报告。**

## Cost Summary

```text
Task: 房产弹窗与审批交互规范调查规划
Status: planning，等待主助手复核
Files changed: 1份报告+23份任务工件；产品0
Tests run: 13项定向测试PASS；2份独立浏览器脚本×2视口；planning/引用/语法检查通过
Retries: 产品0；浏览器启动环境修正2次；依赖安装1次明确参数重跑
Approx model rounds: 约40；已进入COST_GUARD
Repeated scans avoided: 145文件普查仅一次并缓存；早期截断输出做过定向补读
Blocked issues: 缺真实后端验收；G3/G4/G5等需复核
Next step: 主助手审核后决定修复范围，本轮停止
```
