# P0-4/P0-5 合同与敏感读取 Web 独立审计（2026-08-28）

## 1. 审计边界与结论

- 候选基线：`e64e63d576f999a8983f36ff8e80f4f996bbac57`。
- 页面：`/hr/contracts`、`/hr/insurance`、`/hr/payroll`、员工档案中的 HR 附件入口。
- 后端：合同、合同提醒、保险、工资批次明细、本人薪资、`/files` HR 受保护附件路由。
- 结论：页面主体已采用 `ds-page/ds-hero/ds-panel/ds-kpi-grid/ds-mobile-record-list`，合同和保险基本具备桌面及卡片式移动布局；但权限接线存在 4 个 P0 NO-GO，合同提醒尚无 Web 接线，不能作为 P0-4 完成交付。

## 2. P0 NO-GO

### W1 合同附件仍按通用文件权限渲染，和后端原子权限不一致

当前 `/hr/contracts`：

- 上传按钮条件是 `hr:contract:manage + system:file:upload`，后端真正要求 `hr:contract_document:manage`。
- `AttachmentList` 下载/预览按钮只识别 `system:file:download`，删除只识别 `system:file:delete` 加页面传入的 `hr:contract:manage`。
- 合同附件列表对所有合同读取者无条件发起 `/files?biz_type=hr_contract_document`，但后端要求 contract-document park/team/self atom。

影响：

- 合法持有 HR 附件 atom、但没有通用文件 atom 的用户看不到操作按钮。
- 持有通用文件 atom、但没有 HR 附件 atom 的用户会看到按钮，点击后才收到 403。
- 合同管理权限被错误当成合同附件管理权限，形成前端权限虚标。

必须实现：

- 合同附件列表：`hr:contract_document:read|team_read|self_read|manage` 任一满足才挂载。
- 上传/删除：只以 `hr:contract_document:manage` 控制；共享组件应支持 `readPermissions/downloadPermissions/managePermission`，不能把 HR 页面退化为通用文件权限。
- 员工档案附件同样改为 `hr:employee_document:read|team_read|self_read|manage`；员工照片若共用该 biz type 权限，按钮也必须使用同一原子权限集合。
- 无附件权限时不发请求，显示简短的“无附件查看权限”，不得展示操作后再报错。

### W2 保险页面把“园区读取”误当成“金额读取”，并会渲染 `undefined/NaN`

当前 `HrInsuranceClient`：

- `full = hr:insurance:read`，未使用 `hr:insurance_amount:read`。
- 列表固定渲染 `employeeAmount/supplementAmount`，KPI 执行 `Number(row.employeeAmount)`。
- 后端对 team 或 park-without-amount 返回不含金额字段的投影；因此页面会出现 `¥ undefined`、`NaN`。
- `full` 为真时还会错误显示单位缴费和合计，即使用户没有 amount atom。
- team reader 的“查看分项”按钮被隐藏；该决策必须明确为产品规则。如果允许查看非金额险种结构，应显示按钮并由响应投影隐藏金额。

必须实现：

- `canReadAmounts = selfOnly || hasPermission(hr:insurance_amount:read)`；单位金额仅 `park read + amount read`。
- 类型把 `employeeAmount/supplementAmount` 改为可选，组件仅在字段真实存在时渲染金额 KPI/文本。
- 无金额权限的经理只显示期间、员工、险种数量、复核状态，不显示占位金额、金额合计或金额存在性暗示。
- KPI 文案必须区分“当前已加载记录”与全量统计，禁止把分页加载和当成全量金额。

### W3 工资批次“查看工资条”未检查 `hr:payroll_detail:read`

当前工资在线区以 `hr:payroll:read` 显示每个批次的“查看工资条”，点击调用 `GET /hr/payroll/runs/:id/payslips`；后端单独要求 `hr:payroll_detail:read`。

必须实现：

- 新增 `canReadOnlineDetail`，无该 atom 时不渲染“查看工资条”，也不得预取详情。
- 详情加载要有独立 `loading/empty/forbidden/error` 状态、取消旧请求和“关闭详情”动作；当前只清空列表并把错误写入页面通用 message，快速切换批次可能回写旧结果。
- 工资详情类型不得包含 `compensationSnapshot`、tenant/park、审计、创建更新人等字段。
- `PUT /payroll/runs/:runId/payslips/:payslipId` 按钮只允许 `hr:payroll:manage`，复核与确认分别只允许 review/confirm atom，并继续依赖服务端状态机。

### W4 合同提醒后端已交付，Web/API 客户端完全未接线

后端已提供：

| 路由 | 权限 |
|---|---|
| `GET /hr/contract-reminders` | park/team/self read 或 manage |
| `GET /hr/contract-reminders/:id` | park/team/self read 或 manage |
| `POST /hr/contract-reminders/run` | run |
| `POST /hr/contract-reminders/:id/actions` | ack 或 manage；action=`read|acknowledge|resolve|cancel` |

`apps/web/lib/hr-api.ts` 没有 reminder 类型或方法，`HrContractsClient` 没有提醒列表、状态筛选、详情、确认/解决/撤销或运行入口。

必须实现：

- 在合同页增加紧凑的“到期提醒”业务区，不增加第二个大段说明性 Hero。
- 仅有 self/team/park read 的用户看到各自范围；run、ack、resolve/cancel 按精确 atom 分别显示。
- `run` 和 actions 使用稳定 idempotency key；按钮 busy 时禁用，完成后刷新提醒而非刷新整页。
- 列表状态：open/read/acknowledged/resolved/cancelled；默认优先 open，不以颜色作为唯一状态表达。
- direct UUID 的跨树/跨园区/不存在提醒统一显示“提醒不存在或不在权限范围”，不得区分存在性。

## 3. 合同页面审计

### API 与字段投影

- list：park/team 使用 `/hr/contracts`，纯 self 使用 `/hr/contracts/me`，方向正确。
- detail：统一 `/hr/contracts/:id`，依赖服务端从 actor 原子权限推导 park/team/self，客户端不传 scope，方向正确。
- salary：响应只在 `hr:contract_salary:read` 且 park contract access 时包含 `probationSalary/baseSalary`。Web 以字段存在性渲染，安全；但应显式定义 `canReadSalary` 用于测试，不能依赖偶然的 undefined。
- create/update salary：当前表单用 `contract manage + compensation manage` 控制，和后端写入要求一致；读 salary 与写 salary 是两套权限，不得混用。
- 历史合同：页面隐藏写按钮和上传入口，符合 immutable 基线；服务端仍是最终边界。

### 状态与交互

- 主列表有 loading/empty/error，加载更多有 busy；详情缺少局部 loading，点击后没有可见进度，应增加详情 skeleton/aria-live。
- 快速连续选择合同时没有 AbortController/generation fencing，旧详情可能覆盖新选择；参照工资历史模块的取消模式修复。
- `window.confirm` 可保留为短期安全确认，但生产级应使用设计系统确认对话框并明确合同编号、动作及不可逆影响。
- 新建/编辑表单较长；390px 下应按单列、sticky 或靠近表单底部的主操作呈现，保存错误聚焦到第一个错误字段。
- Hero 的一句摘要尚可；不要再增加迁移架构、兼容策略、审计原理等长说明。操作规则放字段 helper、空状态或帮助抽屉。

## 4. 附件页面/组件审计

- HR 页面使用非 compact `AttachmentList` 时仍渲染 `work-panel + form-stack + table`，嵌套在 `ds-panel` 内会出现重复容器/框线，并在 390px 依赖旧 table CSS。
- compact 文案硬编码“已上传平面图/暂无平面图文件”，用于员工照片、档案和 HR 文件时语义错误。
- 非 compact 按钮仍用 `primary-button/pagination-button/work-panel`，没有完全统一到 HR Design System。

必须实现：

- 共享组件增加 `label/emptyLabel`，HR 页面显示“合同附件/暂无合同附件”“员工照片”等真实业务文案。
- HR 内嵌模式采用透明内容容器，只保留外层 `ds-panel` 与单条附件卡边界，禁止 `ds-panel > work-panel > table` 三层框线。
- 390px 使用 `ds-mobile-record-list`，文件名可换行，操作区按钮最小触控高度 44px，无横向滚动。
- 列表加载、空、403、失败、删除后刷新失败分别有稳定状态；错误不得回显存储路径、hash、bucket 或原始后端堆栈。

## 5. 工资页面审计

- 工作区导航使用一层 panel + tabs，视觉层级基本合规；在 390px 收敛为单列，没有强制桌面表格。
- 页面已有统一 `ViewState`，但在线工资批次详情仍未采用；必须收敛到相同状态模型。
- `StatePanel` 错误文案简短，符合“不堆长说明”；禁止把权限模型解释铺在页面顶部。
- `desktopSensitive` 在移动端直接隐藏敏感区域时，必须提供等价的安全移动入口或明确“请在桌面办理”，不能无提示丢失业务动作。

## 6. Direct UUID 与错误合同

- 403：只有在路由 atom 本身缺失时显示“无权访问”。
- 已有路由 atom但对象跨树、跨园区、已删除或随机 UUID：统一 404 语义，页面显示“记录不存在或不在您的权限范围”。
- 500 required-audit/storage failure：显示通用“读取失败，请重试”，不得自动降级返回未审计数据；下载失败不得保留旧 Blob/预览 URL。
- 切换对象前清除旧详情；错误时不得继续显示上一个人的合同、保险金额、工资或附件。

## 7. 自动化验收清单

### 权限矩阵

1. 仅 contract page、无 read atom：页面级禁止，不请求合同 API。
2. contract self/team/park 三角色：列表和 direct UUID 分别只见本人/管理树/园区；跨域同一安全错误。
3. salary atom 有/无：DOM 与网络响应均无越权工资字段。
4. contract-document self/team/park/manage：列表、预览、下载、上传、删除按钮和请求完全匹配原子权限；通用 file atom 不得替代 HR atom。
5. insurance team 无 amount：DOM 不含金额、`undefined`、`NaN` 或单位成本；加入 amount 后仅出现许可投影。
6. payroll read 无 detail：不出现详情按钮、不调用 payslips；加入 detail 后才可加载。
7. reminder self/team/park/run/ack/manage：五类角色分别只看到允许的入口和动作。

### 状态与并发

1. 每个列表：loading、empty、403、404、安全 500、retry。
2. 每个详情：loading、empty、关闭、连续快速切换，旧响应不得覆盖新选择。
3. 写按钮：双击仅一个请求；idempotency key 存在；busy 禁用；成功局部刷新；失败保留可恢复输入。
4. 下载：审计失败、storage missing/open failure 时无文件响应头和文件字节；CRLF 文件名不能注入 header。

### 视觉与 390px

1. Playwright 视口至少 1440x900 与 390x844。
2. `document.documentElement.scrollWidth <= innerWidth`。
3. Hero、panel、KPI、record 的 padding/gap 使用全局 DS；无 `work-panel` 与 `ds-panel` 重复边框。
4. 操作按钮不重叠、不截断，触控目标至少 44px；长合同号、员工名、文件名可换行。
5. 页面顶部只保留标题和一句业务摘要；不出现迁移说明、权限原理或大段帮助文字。
6. 截图比对重点：合同表单、合同详情+附件、保险无金额经理态、工资批次无 detail atom、提醒 self/team/HR 三角色。

## 8. 建议实施顺序

1. 先修 W1/W2/W3 权限和字段显示，增加 Web contract tests，避免 UI 继续虚标后端权限。
2. 接入 contract-reminder API 与最小工作区，完成 self/team/park/run/ack/manage 三角色负例。
3. 把 HR 附件内嵌模式统一为 DS mobile records，去除重复框线和错误“平面图”文案。
4. 最后执行桌面/390px Playwright、真实受保护账号 UAT 和截图验收。
