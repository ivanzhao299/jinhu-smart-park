# 玉舟 V10 客户端与集团 Web 双端覆盖完成度审计

日期：2026-08-28  
候选基线：`16d7691030916296a7bc90254e0280a8f7eb031c`  
操作边界：只读审计已固化证据、映射合同和新系统代码；不记录凭据、网络端点、个人值、工资值或未脱敏截图；不执行旧系统写操作或历史导入。

## 1. 结论

当前不能宣称“玉舟 V10 客户端版与集团 Web 版全部功能已完整复现”。

- 客户端合同仍是 `IN_PROGRESS / L3_RUNTIME_PARTIAL`：13 个业务族中 `observed=0` 、`partial=13`，83 个语义入口只有 18 个 page check，兼容分贡献为 0。
- 集团 Web 已证明为独立运行表面，已有 231 个稳定 `legacyId`、186 个可导航路径的源码/数据库结构证据；但没有有效 Web 会话下 HR/经理/员工的页面级实遍历。
- Smart Park 源码覆盖报告是 `0 implemented / 162 partial / 69 mapped_only`，均分 64.94。该分数是目标源码锚点完整度，不是旧业务兼容度。
- 原子库存门禁仍报 `ATOMIC_INVENTORY_INCOMPLETE`，总兼容基线为 `13.75/100`。
- 三个 reviewed 核心域只覆盖 12 表/260 字段，不是 162 表/2,364 字段、212 规则、915 权限行的全域完成证明。
- 生产历史导入仍必须 `HOLD`。

## 2. 证据等级与不可互相替代规则

| 标记 | 含义 | 能证明 | 不能证明 |
|---|---|---|---|
| `TRAVERSED` | 旧表面已在真实会话中只读打开 | 入口、可见字段/按钮和拒绝行为 | 未执行的保存、审核、结账结果 |
| `DB_CORROBORATED` | 旧库表/列/过程/触发器存在 | 数据结构和部分公式依赖 | 页面是否显示、用户如何操作、角色是否可用 |
| `SOURCE_CORROBORATED` | 旧 Web 源码可解析 | 路径、表单名、SQL/过程引用 | 部署环境中的实际 DOM、会话和数据投影 |
| `TARGET_IMPLEMENTED` | Smart Park 存在 route/API/entity/permission/test | 新系统有对应技术能力 | 与任一旧表面已达字段/规则/状态对等 |
| `INFERRED` | 从菜单名、帮助或相邻字段推断 | 下一步研究方向 | 任何 mapped/tested/implemented 声明 |
| `MISSING` | 没有可复核证据 | gap | 不得用另一端或新系统填充 |

客户端的 93 条授权目录不能证明集团 Web 的角色菜单；集团 Web 的 231 个 `legacyId` 不能证明客户端内的三级按钮；Smart Park 的三角色 A/B UAT 不能证明旧 Web 三角色页面已遍历。

## 3. 按业务域的完成度

| 域 | 客户端 | 集团 Web | Smart Park | 当前结论 |
|---|---|---|---|---|
| 组织/职位 | 树、单位/部门/职位入口部分 `TRAVERSED` | 8 项结构 `SOURCE_CORROBORATED` | 组织页面已实现 | 删除/移动、引用检查、角色范围未闭环 |
| 员工档案 | 基本页和部分字段 `TRAVERSED`，附属档案缺遍历 | 22 项结构，人员/照片/查询未角色遍历 | 基本/扩展档案、照片/附件原子权限已实现 | 12 表 reviewed 中只涵盖部分档案表；自定义字段和报表仍 gap |
| 就职/调动/离职/复职 | 部分动作页和 JZ/DZ/LZ/FZ 双证据 | Web 异动查询/统计只有源码/库证据 | 审批+原子事件链已实现 | 撤回、作废、半完成、Web 手工 apply 尚无旧表面实遍历证据 |
| 合同 | 台账列、转正/导入/提醒入口部分已观察 | Web 到期查询结构已解析 | 合同链、提醒、敏感附件已实现 | 续签/变更/终止原页动作、日界、导入校验尚未完整遍历 |
| 培训 | 课程/计划部分字段已观察 | 31 项源码结构 | 工作台已实现 | 参训人、评定、测试、经费、完成状态和报表未原子对账 |
| 绩效/360 | 旧标准→记录→结果→汇总链部分观察 | 20 项源码结构 | 新绩效和 360 已实现 | 360 是现代扩展，不得替代旧项目/权重/导入/汇总口径 |
| 奖惩 | 类别和部分正负参数已观察 | 查询结构已解析 | 奖惩页、附件和 self-read 已实现 | 导入校验、审批/作废、薪酬/绩效联动未证明 |
| 工资薪酬 | 七类职责和部分账套/项目/报盘/月结页已观察 | 22 项源码结构，员工/经理/薪酬角色未登录遍历 | 近三年历史查询、工资批次和敏感明细权限已实现 | 公式范围/容差/审批、正式报盘、月结和 HR/薪酬/财务签署仍是 P0 |
| 考勤 | 方案/项目/阈值部分观察 | 29 项源码结构 | 申请、班次、排班、打卡、日结果、月结已实现 | 旧符号、导入、异常、请假/加班/出差与工资输入完整链未双向对账 |
| 保险福利 | 人员方案/生效区间已观察 | 保险路径/结构已解析 | 台账、金额原子权限已实现 | 政策版本、险种比例、补缴/更正/关账状态未闭环 |
| 招聘 | 申请→审批→发布→录用链部分观察 | 23 项源码结构 | requisition/candidate/onboarding 已实现 | 旧发布渠道、附件、候选状态和 Web 敏感投影未完整对账 |
| 报表/导入导出 | 多域存在查询/统计/打印/Excel | Web 存在查询和报表路径 | 仅部分页面及导出权限 | 这是全域横切 gap，不得由“有列表页”替代 |
| 系统/权限/日志/提醒 | 管理员 93 条目录及双轨权限冲突已观察 | 菜单/角色/部门范围有库证据 | 原子 RBAC、审计、合同提醒已实现 | 915 条旧授权的菜单/动作/字段/范围处置未完成 |

## 4. 必须阻断的假覆盖

### P0-A：Smart Park UAT 被当成旧集团 Web 实遍历

`legacy-group-web-implementation-coverage-lib.mjs` 把 `yuzhou-live-role-uat` A/B 证据直接记为 `liveRoleUat`。该 UAT 实际运行 Smart Park API/browser 矩阵，不是旧集团 Web 会话。目前测试明确允许它把 12 个 legacy item 从 90 分提升为 `implemented/100`。

在旧 Web 真实 HR/经理/员工会话下完成字段、按钮、状态、直链越权和错误恢复遍历前，这 12 项只能称 `TARGET_TECHNICAL_UAT_PASS / LEGACY_RUNTIME_UNVERIFIED`，不得称 `implemented`。

后续契约修复（提交基于本报告继续实施）：评分器已拆分 `targetTechnicalUat` 与 `legacyRuntimeUat`。Smart Park A/B 证据只计算 `targetImplementationScore`；旧端 `score/implementationStatus` 只有在固定 `surface=group_web`、三角色、页面、路由、观察时间和证据 hash 的旧运行时合同通过后才可升至 100/implemented。旧的歧义参数会直接 fail closed。

### P0-B：15 项 Web 入口映射不等于 231 项全菜单

15 项简化入口合同原本存在人员照片的过期权限/测试锚点：它仍指向旧 `HR_EMPLOYEE_PROFILE_READ` 和“sensitive-profile permission”测试名，而当前实现已收紧为 `HR_EMPLOYEE_DOCUMENT_*`。本审计已更正该合同锚点。即使 15/15 重新通过，也仅证明 15 个入口的目标源码绑定，不能替代 231 个菜单节点的行为兼容。

### P0-C：`mapped` 只证明有目标 route

`legacy-group-web-module-mapping-v1.json` 的 231 项都是 `mappingStatus=mapped`，但大量项共用同一 Smart Park 页面。只有 route 映射不证明旧三级按钮、字段、状态、报表或数据范围已实现。

### P0-D：reviewed core mapping 的证据不能外推

12 表/260 字段只属于 employee profile、employment change 和 contract 三域。它不能给工资、考勤、保险、绩效、培训、奖惩、招聘、报表或权限域提供 mapped 信用。

## 5. 优先级与执行分类

### P0：不闭环则不得宣称完整复现

| 任务 | 分类 | 交付物 |
|---|---|---|
| 拆分 `targetTechnicalUat` 与 `legacyGroupWebRuntimeUat` | 可先实现 | 评分器和负向测试；没有旧 Web runtime evidence 不得输出 implemented |
| 完成旧集团 Web 三角色页面遍历 | 必须再遍历 | surface-scoped 页面/DOM ID、脱敏证据 hash、字段/动作/状态、allow/deny |
| 完成客户端 13 族、全入口和三级动作遍历 | 必须再遍历 | 稳定 `client:*` ID、字段/默认/校验/状态、只读结果 |
| 完成 162 表/2,364 字段/212 规则/915 权限行原子库存 | 可先实现+遍历回填 | 双端 locator、evidence level、disposition、target R/A/E/P/T |
| 工资公式、容差、报盘、月结 | 必须再遍历+真人决策 | 空白/设置页字段、过程交叉证据、HR/薪酬/财务签署 |
| 旧导入/报表/导出的横切目录 | 可先实现目录，必须再遍历语义 | 每个域的校验、列、口径、权限、文件 hash |

### P1：可在 P0 证据补齐期并行实现

- 培训记录/经费、奖惩导入及联动、保险政策/补缴、考勤异常/请假/加班/出差的原子映射和状态测试。
- 客户端自定义档案槽位到新字段定义/历史值存档的映射。
- 合同导入、转正、续签/变更/终止的原页动作和新状态机对账。
- Web 和客户端各自的角色、菜单、动作、字段、数据范围五层负向矩阵。

### P2：现代化增强，不用于抵扣旧兼容 gap

- 360 评价、人才发展、新绩效模板、目标分解、日/周/月报、统一工作流、移动端和现代审计。
- 这些能力可以提升现代企业适用性，但不得将旧考核、旧报表、旧导入或旧角色 gap 改成 mapped。

## 6. 下一可直接执行的工程切片

1. 修正 implementation coverage 评分语义：输出 `targetTechnicalUat` 和 `legacyRuntimeUat` 两个维度，只有后者可以消除旧表面证据 gap；两者和 L5 签署均存在时才允许对外输出 complete。
2. 创建两个不可互换的原子清单：`client:*` 与 `group-web:*`；同名业务能力必须有两个 surface locator。
3. 优先遍历当前 12 个被技术 UAT 可提升为 100 分的 legacy item，为评分器建立第一批真实旧 Web runtime evidence。
4. 并行从客户端完成员工附属档案、合同动作、考勤异常、工资七类页的只读空白/设置页遍历。
5. 将新证据只以 hash-only、脱敏、surface-scoped 索引绑定到 atomic inventory；任一端缺失都保持 gap。

## 7. 本次机器验证结果

- 客户端遍历合同：PASS，但报告 `observedFamilies=0 / partialFamilies=13 / incompleteRequirements=6 / import=HOLD`。
- 集团 Web 运行拓扑：4/4 PASS，证明三个旧表面不可合并。
- 集团 Web 源码/数据库运行合同：4/4 PASS。
- 231 项菜单映射：4/4 PASS。
- 186 个可导航项源码审计：3/3 PASS。
- 目标实现覆盖合同：10/10 PASS；当前默认报告仍为 0 implemented。
- 15 项 Web 入口绑定：首次运行因人员照片权限/测试锚点过期而 fail closed；本审计已修正为 employee-document 原子权限证据。
- 总兼容覆盖：13.75/100，`ATOMIC_INVENTORY_INCOMPLETE`、`LEGACY_CLIENT_L4_TRAVERSAL_MISSING`、`LEGACY_BUSINESS_L5_SIGNOFF_MISSING`。

本审计不包含生产资源操作，不改变 `productionImport=HOLD`。

## 8. P0-A 修复后的评分变化

- 无 UAT 证据：仍为 `0 implemented / 162 partial / 69 mapped_only`，旧端均分 `64.94`。
- 注入通过验证的 Smart Park A/B 技术 UAT：旧端仍为 `0 implemented / 162 partial / 69 mapped_only`，旧端均分仍为 `64.94`；12 项仅在独立的目标实现维度达到 `targetImplementationScore=100`。
- 注入固定旧集团 Web 三角色运行时证据：只允许证据逐项绑定的 legacy ID 增加旧端运行时 10 分；源码、数据库、客户端或不完整角色证据均 fail closed。
