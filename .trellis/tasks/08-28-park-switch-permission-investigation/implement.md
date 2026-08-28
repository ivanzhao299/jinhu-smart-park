# Investigation Plan

1. 固化基线：记录 branch/HEAD/status、相关审计报告与既有 UAT/任务工件、隔离环境规则。
2. 并行静态探索：auth switch-context、users/me/menu/super、API/Web guards、用户园区分配写链、bootstrap/park-create 授权来源；要求 `file:line` 与关键原文。
3. 主代理按子代理定位点验关键源码；亲自阅读最终要引用的确切代码片段与奠基文档。
4. 建立独占 compose 与专用浏览器证据目录，记录 preflight 和 16 表冻结基线。
5. 经产品 API 构造 S1/S2/S3，执行浏览器断言、截图、全路径 Network 与 DB 计数；保存 manifest。
6. 汇总根因、定性、候选方案、推荐、风险、迁移、验证与产品决策门。
7. 写 `docs/reviews/park-switch-permission-investigation-2026-08-28.md`；检查链接、敏感信息、产品代码零改动与 HR 零触碰。
8. 执行报告相关校验与 Trellis quality check；提交报告分支并 push。
9. 创建 PR，完成一轮 review；修正文档问题后等待 CI，合并并确认 main 双绿。
10. 归档 investigation 任务并完成终报；不创建修复 Issue。

## Validation

- `git diff --check`
- `git diff --name-only <baseline>...HEAD`（只允许报告与本调查 Trellis 工件）
- 报告引用路径/行号抽查与证据 manifest 校验
- S1/S2/S3 Network、截图与 DB 证据存在性/一致性检查
- PR review 状态与 GitHub CI checks
- merge 后 main 分支双绿检查

## Rollback Points

- 隔离环境数据或场景污染：丢弃该独占 compose project 后重建，不接触其他容器。
- 浏览器证据不完整：场景标为未证，不以静态推断冒充动态结果。
- PR review 发现定性越界：仅修订报告/任务工件，不进入产品代码修复。
