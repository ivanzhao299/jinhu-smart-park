# 民宿模块全流程真实浏览器 UAT

## Goal

在当前 `origin/main@b26cf4c3` 上，严格按 `docs/testing/windows-chrome-cdp-uat.md` 对民宿模块完成设计到实现的闭环审计、隔离环境真实 Chrome 全流程 UAT、证据与 residual 清理闭环，并通过仅包含报告与 Trellis 工件的 PR 完成审查、CI、合并和发布状态核验。

## Confirmed Scope

- Web：`apps/web/app/homestay/` 全部页面与共享房源选择器依赖。
- API：`apps/api/src/modules/homestay/` 及其 property、property-approvals、RBAC、park scope 依赖。
- 设计源：07-24、07-30 与 08-20 民宿任务、`docs/uat/homestay-mvp-evidence.md`、AGENTS.md 和 shared 权限契约；历史结论仅作线索，本轮以当前代码、真实 UI 和本轮隔离数据库为准。
- 角色：管理员、民宿业务岗、窄权限岗、跨园区岗（fixture 可行时）。
- 流程：共享房源底座冒烟、定价库存、预订入住与财务、退房周转、仪表盘一致性、设计声明的分支、权限与数据范围。

## Requirements

- 阶段 0 先审计共享房源数据模型/资格与授权、property-approvals 接线、property-shared 选择器和离线草稿适配；任一依赖不闭合时将下游流程记 gap/blocked，不强行进入浏览器矩阵。
- 汇总状态机、财务边界、菜单/路由/权限、API/前端接线、占位代码、写入到展示数据链与前后端校验，产出带证据路径的《设计-实现闭环审计表》。
- 从审计表推导流程链和 Case 矩阵；未实现、部分实现或设计矛盾链路不进入浏览器执行。
- 使用唯一 RUN_ID 隔离 compose、端口、env、fixture、文件根、artifact 和报告；初始化五步与 health/ready/Web 三门禁必须通过。
- fixture 按园区/租户→房源/单元/授权→民宿数据顺序建立，统一前缀 `UAT_HOMESTAY_<RUN_ID>_`。
- 使用 Windows 专用 Chrome CDP 9222 真实交互；执行状态迁移、UI 断言、只读 DB 佐证、三态、防双击、console/network、桌面与实际窄窗口、键盘/可访问性及设计适用的离线恢复。
- FAIL 同题最多排除环境重试两次；验收轮不修改产品代码，设计实现差距记 gap。
- 报告和本地证据不得包含密码、JWT、Cookie、Authorization、连接串、个人敏感信息或签名 URL；截图只保留在 ignored `artifacts/`。
- 结束时真实 UI 登出、fixture/文件清理、逐表 residual=0、同参 compose down、PID 与端口清零，不操作他人容器或用户主 Chrome。
- 创建 `codex/homestay-uat-<RUN_ID>`，仅提交报告和本任务 Trellis 工件；创建 PR、最多三轮 `@codex review`、CI 绿后 squash merge，核验 main CI 与 Deploy，执行 RBAC ff、删分支、prune、主检出切新分支。

## Acceptance Criteria

- [ ] SOP 全文已读，阶段顺序和 RUN_ID 隔离有可核验证据。
- [ ] 阶段 0 审计表包含 P-FOUNDATION 条目、状态机、权限、接线、数据链和校验结论及 gap。
- [ ] 流程链、角色、Case 和 residual 逐表清单均由审计结论推导。
- [ ] 所有可执行 Case 经真实 Chrome 完成交互序列并记录 PASS/FAIL/BLOCKED、DB 辅证、console/network、viewport 和 local-only 证据索引。
- [ ] `docs/uat/homestay-full-flow-uat-<RUN_ID>.md` 满足 SOP §8 元数据和正文模板。
- [ ] 产品代码零改动；仅报告与本任务 Trellis 工件进入 PR。
- [ ] fixture、文件、compose 资源和本轮端口 residual=0，非本轮容器前后保持一致。
- [ ] PR 审查闭环、CI、squash merge、main CI/Deploy 和本地收尾状态均如实记录。
- [ ] 仅在全部验收条件 PASS 时归档任务；存在 FAIL/BLOCKED 时保持 in_progress 并记录缺口。

## Out of Scope

- 修复本轮发现的产品缺陷或设计差距。
- 操作生产数据、生产凭据、他人容器、phoenix 系资源或用户主 Chrome。
- 将 local-only 截图强制加入 Git。
