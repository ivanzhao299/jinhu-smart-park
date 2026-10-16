# 建议与投诉验证

隔离合成 PostgreSQL 全迁移 + 真实 Nest HTTP，不执行生产操作或导入。本地汇总结果存私有目录 `/Users/mac/.codex/artifacts/hr-employee-feedback-workflow-20261017`，目录0700、文件0600。

```sh
pnpm --filter @jinhu/shared build
node --test scripts/e2e/hr-employee-feedback.contract.mjs
TS_NODE_PROJECT=apps/api/tsconfig.json TS_NODE_TRANSPILE_ONLY=true node --test --require ./apps/api/node_modules/ts-node/register apps/api/src/modules/hr/hr-employee-feedback.pg.spec.ts
pnpm --filter @jinhu/web exec vitest run --config vitest.config.ts test/interaction/hr-employee-feedback.test.tsx test/interaction/hr-employee-feedback-api.test.tsx test/interaction/hr-approval-operation-continuity.test.tsx
```

PG测试不允许skip，Docker不可用即失败。使用独立名称/精确label/tmpfs/loopback随机端口，实际 db-migrate.sh 应用完整链至376；包括失败路径finally核对label并清理唯一owned容器。真实Service/Guard依赖注入、ValidationPipe、PermissionGuard、IdempotencyKeyGuard和DB IdempotencyService，实际required审计实体事务。

验收包括创建/编辑/提交/取消/撤回/回复/完整历史分页，类型状态筛选，本人/他人/园区HR/团队角色/未绑定/跨园区边界，Unicode与NUL及未知字段，原键重放/改体409/撤权先于重放，真实两个连接回复撤回行锁竞争，审计故障回滚，SQL终态/历史不可篡改；公共日志不含正文或回复。Web验证失败保留、未知结果原请求冻结重试、保存后读失败、身份/选择漂移、分页、HR回复隔离、可见403和Unicode。

本地合成结果不替代独立检查、实际浏览器桌面390检查、CI或生产真实角色验收。旧4菜单仅目标锚点，未给旧规则等价完成信用。既有员工本人档案与工资流程不变。

## 本轮本地结果（2026-10-17）

- Shared lint/typecheck/build通过，合同2/2、0skip。
- 实际完整376迁移 + HTTP矩阵1/1、0skip；最后owned容器6e618e6e已清理。增加真实跨租户HR拒绝、旧performance/Yuzhou函数OID/ACL/定义及工资/source表指纹前后相等。增强matrix上一轮也1/1通过；未以递归导入或skip代替。
- Web新feature11+adapter3=14通过，既有审批9通过；menu/routes/command-palette22通过；source-role evidence11通过，均0skip。
- API lint/typecheck/build与Web affected lint/typecheck/build最后固定检查均exit0，完整原始日志及逐命令退出码见私有implementation/checks.json。Web构建仅既有CSS/autoprefixer/Next ESLint及canteen无关warning。
- git diff --check通过。独立检查、真实组件桌面/390浏览器及后续发布由根代理执行；本实现未提交/部署/写生产，也未证明旧端规则或生产真实岗位。

## 独立复核追加

复核补充实际组件反例：初次context读取失败恢复、绑定/能力变化与401/403清除、503保留HR回复与范围、历史翻页及失败不覆盖草稿、重复选择与新版本冲突保留原CAS。隔离PG fixture不依赖开发者绝对路径；每次以`mkdtempSync(tmpdir())`建立独立0700证据目录，compose/迁移日志0600，日志打印位置，完整测试后只清理精确owned容器。
