# Phase2-B 绩效评价与校准实施证据

日期：2026-08-25

## 基线与编号

- 开始前本地、当前分支基线和 `origin/main` 均为 `96db5afb71090b6482c77af0e40ded417b04811e`。
- fetch 后扫描全部远端 migration/production seed；新前向编号为 migration `000259`、production seed `000025`。
- `000258` 及更早已成功迁移未修改。

## 纵向闭环

- 数据库新增追加式自评/主管评价、校准批次/参与人/调整、申诉和动作证据；员工评价状态扩展到签收、申诉和确认。
- 服务端按冻结模板使用 PostgreSQL numeric 复算总分和等级；自评、主管评价、校准、签收、申诉/裁决均使用悲观锁和事务。
- 员工确认前的 self 投影隐藏主管评价、校准、最终结果和结果动作；敏感读取使用 required audit。
- 所有 POST 使用精确原子权限、IdempotencyInterceptor 和 `captureBody:false`；直接 Service 范围只允许 park、managed tree、self 或 none。
- `/hr/performance` 提供 HR、部门负责人、员工三角色工作台，使用可读 options，不输入 UUID，并提供 generation/AbortController、403、error、empty、retry 和 390px DS mobile records。

## 验证快照

- Shared build、API/Web lint/typecheck 已通过；API/Web build 已启动收口验证。
- focused contract：12/12 通过，包括员工确认前/后显式投影断言。
- API full unit：1502 tests，1474 pass，0 fail，28 skip。
- template0 fresh：250/250 migrations 与 8/8 prerequisites 通过；production seed 两次通过；checksum replay 250/250 skip matched。
- 真实 PostgreSQL 门禁发现并修复 `employee_acknowledged` 超出 000258 `varchar(20)`（包括旧触发器局部变量）的向前兼容缺陷；修复后状态机、最终分数/等级复算、申诉改分、终态/证据不可变和员工/工资/考勤零副作用门禁通过。
- 两个独立 PostgreSQL writer 同时写入相同追加动作序号，结果为一成功、一唯一约束失败、最终仅一行，证明并发失败关闭。

- 最终 fresh 250/250、prerequisite 8/8、production seed 两次、checksum replay 250/250 均通过；含非空 000258 模板/版本/维度/等级/周期的 upgrade 仅应用 000259，旧模板哈希守恒且状态宽度升级成功。
- API/Web production build 与 CSS architecture check 通过；`git diff --check` 通过。
- 三角色桌面/390px 浏览器 UAT 留给独立 check（本实现阶段没有启动或部署运行时）。本阶段未 commit、push、deploy 或写生产库。

## 独立 Trellis Check 修订

- 将 Web 的角色级按钮判断收紧为 Service 逐记录 `actions` 投影：本人、直属主管、签收、申诉和申诉裁决只有在当前记录真实可执行时才显示，避免部门树列表对非直属或非本人记录发起越权请求。
- 校准批次不再投影参会用户 UUID，改为当前操作者 `canAct`；非参会人不会显示或调用校准动作。校准调整、批次完成和申诉裁决增加本人不得审本人门禁。
- 校准参会选项和批次读取增加 required audit；读取投影先清空旧敏感状态，继续保持 generation 与 AbortController 失效请求隔离。
- 000259 为 submission/batch/participant/entry/appeal/action 的 actor、creator、completer、participant、submitter 和 resolver 补齐 tenant + park 复合 `sys_user` 外键与完整非 partial 子索引，阻止绕过 Service 写入跨园区身份。
- 修订后 focused contract 9/9；API full 1505 total / 1477 pass / 28 environment skip / 0 fail；Shared/API/Web lint、typecheck、workspace production build、CSS architecture 与 diff-check 全部通过。
- 独立数据库复验：template0 fresh 250/250 + prerequisites 8/8；production seed 连续两次；checksum replay 250/250；真实非空 000258 前置库升级仅应用 000259，template/version/dimension/level/cycle/employee 计数、主键和旧字段 hash 守恒且每个旧 cycle employee 恰好生成一条 baseline action。
- PostgreSQL 状态机、numeric 复算、upheld appeal、终态/证据不可变和员工/工资/工资条/考勤零副作用通过；两个真实 writer 竞争同一 action 序号为一成功、一唯一约束失败、最终一行。所有 disposable 数据库和临时目录已清理为零。
