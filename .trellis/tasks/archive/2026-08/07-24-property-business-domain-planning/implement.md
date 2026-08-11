# 房产经营业务规划实施计划

## 1. 本任务交付顺序

- [x] 创建父任务并记录源需求。
- [x] 调查现有资产、房源、租赁、财务、能源和工单模型。
- [x] 完成关键产品决策访谈。
- [x] 创建四个子任务。
- [x] 编写父任务 PRD 和总体设计。
- [x] 编写范围/UAT、共享底座、民宿、住房出租子任务 PRD。
- [x] 完成各复杂子任务的设计与实施计划。
- [x] 校验任务结构、父子依赖和文档一致性。
- [x] 提交规划文件给用户评审。

## 2. 用户批准规划后

按以下顺序分别激活子任务，不启动父任务：

1. `07-24-scope-uat-alignment`
2. `07-24-shared-property-foundation`
3. `07-24-homestay-mvp`
4. `07-24-housing-rental-mvp`

跨业态分析另建后续任务。

## 3. 预计权威文档

范围/UAT 子任务：

- `docs/product/current-product-scope.md`
- `docs/deployment/environment-matrix.md`
- `docs/uat/full-product-acceptance-matrix.md`
- 更新 `README.md`、`docs/index.md`、`docs/sprint-roadmap.md`

领域设计子任务：

- `docs/architecture/property-business-domain-blueprint.md`
- 各 MVP 产品与技术设计文档
- 必要的 `.trellis/spec/` 可执行规则

## 4. 质量门禁

文档阶段：

- 检查所有链接和文件路径。
- 搜索权威入口中冲突的“首发/二期/真实生产”表述。
- 校验父子任务状态、依赖和验收条件。
- 确认无密钥、真实密码和私密连接串。

后续代码阶段：

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- 目标模块单元测试和 E2E
- 数据库迁移历史/checksum 验证
- 桌面与 390px 移动端浏览器验证
- UAT 场景回归和清理验证

## 5. 风险与回滚点

- 范围校正文档不得批量重写历史 release 证据；只新增当前口径和必要交叉引用。
- 数据库设计必须使用新迁移，不编辑既有迁移。
- 共享占用上线前必须验证现有有效合同兼容。
- 新模块通过独立 module/permission/menu 开关灰度开放。
- 任一财务或占用迁移失败后停止后续 seed、部署和验证。
