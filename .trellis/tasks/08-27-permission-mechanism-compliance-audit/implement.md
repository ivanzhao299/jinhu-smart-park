# 执行计划

1. 固定基线，收集当前 docs 结构、相关 spec、历史 PR/Issue/UAT 与迁移先例。
2. 并行探索 shared/seed 契约、API 权限与 scope、Web 菜单/路由、审批与文件/字段、三模块业务调用链；要求返回 `file:line`。
3. 主线程点验关键出处，归纳 MEC-* 及可检验判据。
4. 生成权限码三视角矩阵和模块 × MEC 矩阵，逐项裁定。
5. 编制分级问题、复现推理、候选方案、推荐方案、依赖和 UAT 清单。
6. 写报告并验证仅文档/Trellis 改动；运行 Markdown/链接、相关静态契约测试（不需要数据库或产品代码写入）。
7. 执行 Trellis quality check；提交并推送报告分支，创建 PR，请求一轮 `@codex review`，处理报告问题。
8. 等待 PR CI 绿色后 squash merge；等待 main CI 与 Deploy 绿色；归档 Trellis 任务并终报。
9. 追加核查 API 菜单构建、Web normalize/first href、session/park switch、role template/bundle 与 module assignment/seed 双重表示，形成条件矩阵。
10. 把 PAM-004+ 与 PAM-001/002/003 合并为统一方案、决策门、并行组和 UAT 清单；只追加报告/Trellis 工件。
11. 更新既有 #431，重新请求一轮 `@codex review`，等待 PR CI、squash merge 与 main CI/Deploy 双绿。

## 验证与停止条件

- `git diff --check`
- 报告内引用路径/行号抽样或脚本校验
- shared 权限/role-template/manifest 相关现有测试（以仓库脚本为准）
- PR 与 main GitHub checks 必须绿色；失败时仅诊断本分支相关问题，不改产品代码。
- 若审计发现 P0，也只报告并提出方案，不开 Issue、不实施修复。
