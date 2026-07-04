# 2026-07-06 上线角色操作与培训指引

## 目标

这份指引用于周一上线当天的真实值守和首日培训。重点不是解释系统设计，而是明确：

1. 谁先登录。
2. 谁看哪个入口。
3. 谁能填报。
4. 谁能审批。
5. 谁发现问题后往哪里反馈。

## 当前上线状态

截至 `2026-07-04`，本地生产口 `http://127.0.0.1:4330` 已完成以下验证：

1. `pnpm go-live:p0-check`：PASS
2. `pnpm go-live:check`：PASS
3. `pnpm go-live:uat-all`：PASS
4. `pnpm go-live:uat-role-flow`：PASS
5. 工程验收附件上传并回读 `attachment_ids`：PASS
6. 浏览器级工程 / workflow / operations 页面链路 UAT：PASS

## 首日上线顺序

建议按下面顺序放人进入系统，不要一开始全量同时上：

1. 管理员 `admin`
2. 工程物管负责人 `李荣杰`
3. 工程项目经理 `邵明洪`
4. 安装工程师 `郑子勇`
5. 物业现场负责人 `陈国辉`
6. 招商负责人 `宋乾昌`
7. 财务负责人 `刘汉涛`

理由：

- 先保证菜单、权限、字典和用户角色可见。
- 再保证工程主链能跑。
- 最后接入招商协同和财务只读监督。

## 角色操作矩阵

| 用户 | 角色 | 主要入口 | 首日必须动作 | 决策权限 |
| --- | --- | --- | --- | --- |
| `admin` | 超级管理员 | `/system/users` `/system/roles` `/engineering` `/operations/terminal` | 确认全模块可见、创建测试项目、检查字典和用户状态 | 全量兜底，负责最终放行 |
| 李荣杰 | 工程物管负责人 | `/engineering/projects` `/engineering/daily-reports` `/engineering/acceptances` `/workflow/inbox` | 审批工程立项、审核日报、评审验收、查看消息收件箱 | 工程项目审批、日报审核、整改复查、验收评审 |
| 邵明洪 | 工程项目经理 | `/engineering/terminal` `/engineering/projects` `/engineering/rectifications` `/workorders/list` | 创建/提交工单、整改任务、发起验收 | 发起执行，不做最终审批 |
| 郑子勇 | 安装工程师 | `/engineering/terminal` `/engineering/daily-reports` `/engineering/inspections` | 填报日报、提交巡检、登记问题 | 现场执行，无最终审批 |
| 陈国辉 | 物业现场负责人 | `/operations/terminal` `/workorders/list` `/engineering/rectifications` | 派单、复查整改、确认现场闭环 | 现场确认和复查 |
| 宋乾昌 | 招商负责人 | `/leasing/leads` `/workorders/list` `/workflow/inbox` | 创建客户需求、补跟进记录、转协同工单 | 客户侧协同，不审批工程 |
| 刘汉涛 | 财务负责人 | `/leasing/receivables` `/leasing/payments` `/engineering/projects` | 校验应收、收款台账与工程只读状态 | 财务监督，暂不进入工程写动作 |

## 每个角色进入后先看哪里

### 1. 管理员

先看：

- `/system/users`
- `/system/roles`
- `/system/dicts`
- `/engineering`

确认项：

1. 工程管理菜单是否完整显示。
2. 组织、用户、角色、字典页面是否能打开。
3. 字典是否不为空，尤其是工单、隐患、房源相关字段。
4. 当日如发现某角色看不到页面，优先排查权限，不允许前端绕过。

### 2. 工程负责人和项目经理

先看：

- `/engineering/projects`
- `/engineering/plans`
- `/engineering/daily-reports`
- `/engineering/rectifications`
- `/engineering/acceptances`
- `/workflow/inbox`

确认项：

1. 能否看到自己负责的项目。
2. 能否看到待审批、待复查、待验收消息。
3. 详情页按钮是否可点。
4. 状态流转是否正常。

### 3. 现场执行人员

先看：

- `/engineering/terminal`
- `/operations/terminal`

确认项：

1. 终端首页是否按角色展示。
2. 大按钮是否能直接进入日报、巡检、整改。
3. 手机上字号、布局、抽屉是否能操作。
4. 上传照片和提交动作是否成功。

### 4. 招商和财务

先看：

- 招商：`/leasing/leads`、`/workorders/list`
- 财务：`/leasing/receivables`、`/leasing/payments`

确认项：

1. 是否能读取自己需要的列表。
2. 工程只读入口是否可见。
3. 是否出现越权菜单。

## 首日必须跑通的 3 条生产链

### 链 1：工程闭环

1. 管理员创建工程项目
2. 李荣杰审批
3. 郑子勇填报日报
4. 郑子勇创建巡检
5. 巡检生成问题
6. 邵明洪提交整改
7. 陈国辉复查通过
8. 邵明洪发起验收并上传附件
9. 李荣杰评审
10. 管理员确认项目进入已验收

### 链 2：现场工单闭环

1. 邵明洪或招商侧创建工单
2. 陈国辉派单
3. 现场人员处理
4. 责任人确认完成
5. 必要时回到整改或工程问题

### 链 3：消息收件箱闭环

1. 待审批消息进入 `workflow/inbox`
2. 责任人打开消息
3. 标记已读
4. 跳转业务页处理下一步

## 首日培训口径

培训时只讲 4 句话：

1. 先看自己的终端，不要先翻后台。
2. 先处理收件箱，再处理列表。
3. 能提交就提交，不能审批不要硬点。
4. 发现问题先截屏、记页面路径、记角色，不要口头描述完就算。

## 问题上报格式

所有现场问题统一按下面格式发给管理员或开发值守：

```text
角色：
用户名：
页面路径：
操作动作：
期望结果：
实际结果：
是否阻断：
截图：
```

## 上线当日阻断定义

属于阻断，必须立即修：

1. 登录失败。
2. 首页白屏或主要页面打不开。
3. 该角色应该有的菜单不存在。
4. 审批按钮不可点或点击无响应。
5. 提交后数据未落库。
6. 附件无法上传。
7. 消息已到达但无法打开业务页。

不属于阻断，可记录后当天排期：

1. 文案不够顺。
2. 卡片样式不够产品化。
3. 图标、间距、色彩还需继续打磨。
4. 某些非首日路径的二级体验不够顺手。

## 值守建议

上线当天建议保留 3 个值守窗口：

1. 管理员值守
   - 负责用户、角色、字典、菜单问题
2. 业务值守
   - 负责工程、工单、招商、财务流程确认
3. 开发值守
   - 负责权限、接口、页面与日志排障

## 推荐复核命令

```bash
pnpm go-live:p0-check
pnpm go-live:check
pnpm go-live:uat-all
pnpm go-live:uat-role-flow
pnpm go-live:uat-browser -- --path-prefixes /engineering,/workflow,/operations
```

## 与其他文档的关系

1. 决策权限与上线加固：`docs/release/GO_LIVE_2026_07_06_PRODUCTION_HARDENING.md`
2. 角色业务闭环 UAT：`docs/uat/go-live-role-flow-uat.md`
3. 浏览器级页面 UAT：`docs/uat/go-live-browser-uat.md`

