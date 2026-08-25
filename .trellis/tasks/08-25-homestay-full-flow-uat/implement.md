# 民宿全流程 UAT 执行计划

## Ordered Checklist

- [x] 固定基线 SHA、生成 RUN_ID/分支，记录开始时间与初始 Git/容器/端口状态。
- [x] 完整收集设计源；并行探索共享房源数据底座、审批适配、前端 property-shared、民宿状态机/财务、RBAC/菜单/API 接线与 TODO，占位和校验。
- [x] 主代理按代理返回的 `file:line` 抽查并亲读关键设计文档与即将写入的报告，形成设计依据清单和闭环审计表。
- [x] 只把闭合链路转成流程链/Case 矩阵；预列 fixture 建链和 residual 逐表查询。
- [x] 实测选择空闲 DB/API/Web 端口与固定容器冲突；创建 0600 env、隔离 compose project 和文件根。
- [x] 执行 migrate→prod seed→首次 baseline→bootstrap admin→再次 baseline，随后启动 API/Web 并通过 health/ready/login 三门禁。
- [x] 建立带 RUN_ID 的底座 fixture；证明 Web/API/DB 未串默认环境。第二轮 review 确认角色/住客身份 UI 已存在，本轮未沿其建链属于 EXEC-GAP，不是产品阻断。
- [x] 启动独占 9222 专用 Chrome，记录版本与实际 viewport/device 媒体特征。
- [x] 按矩阵执行可合法进入的流程链，记录 UI、DB 辅证、console/network、防双击、三态和窄窗证据；阻断链如实标记，未用后台数据硬绕。
- [x] 对 FAIL 做环境排除并分类 gap/限制，产品代码零改动。
- [x] 完成真实 UI 登出、逐表 fixture 删除与 residual=0、精确 PID/compose/端口清理和非本轮容器前后对比。
- [x] 完成 SOP §8 报告；截图因工具 workspace-root 限制未落盘并已如实披露。
- [ ] 提交并 push 唯一 UAT 分支，创建 PR，最多三轮 `@codex review`，等待 CI 绿后 squash merge；核验 main CI+Deploy 并做 RBAC ff、删分支、prune、切新分支。
- [ ] 全部条件 PASS 才归档任务；否则保持 in_progress，并在报告和最终答复中列明缺口。

## Actual Result

- RUN_ID `20260825-212435`；第二轮 Codex review 后业务 Case：PASS 0、FAIL 3、PARTIAL 5、BLOCKED 16、NOT EXECUTED 2、GAP/BLOCKED 2；C-UX PARTIAL。
- 产品 FAIL：rate 空态 404 泄漏 Console；confirmed 被 dashboard/availability 当作已入住/occupied。
- 证据 FAIL：截图/evaluate 未持久化；原 PASS 全部撤销。清理门禁全部通过；任务因 FAIL/BLOCKED 保持 `in_progress`，不得归档。

## Validation And Gates

- `git diff --name-only <base>`：只能出现本任务 Trellis 工件和 UAT 报告。
- 审计检索：`rg` 覆盖设计源、homestay Web/API、shared permissions/routes、property foundation、migration/schema、TODO/FIXME/暂未/占位。
- 环境门禁：compose label/port、`db:check:init`、API health/ready、Web login。
- 浏览器门禁：真实 Chrome URL/DOM/交互、console/network、实际 viewport、DB 只读佐证。
- 清理门禁：residual 每表 0、file root 不存在、compose label 资源 0、本轮端口 0、非本轮容器不变。
- 发布门禁：PR review 处理完、required checks 绿、squash merge、main CI 与 Deploy 状态记录。

## Rollback Points

- 固定容器名、端口或基线初始化冲突：停止环境启动，不清理非本轮资源。
- 审计发现底座或链路不闭合：将相关 Case 标为 gap/BLOCKED，不创建绕过 fixture。
- PID fd 或 compose label 身份不匹配：停止自动清理并记录人工核查需求。
- PR/CI/Deploy 未绿：不宣称发布闭环完成，不伪造状态。
