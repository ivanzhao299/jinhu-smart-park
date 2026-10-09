# 验证回执

基线bd486e60a8692d059ee8dbb90abb50361119c083；2026-10-09，独立codex/hr-reward-category-versions-20261009。最新main整合时只有父任务children冲突，保留360分页和奖惩版本两个子任务；hr-api分离领域新增自动合并，最终差异检查通过。

- `pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-reward-category-versions.spec.ts src/modules/hr/hr-rewards.contract.spec.ts src/modules/hr/hr-reward-employee-options.spec.ts`：15项通过。
- `HR_REWARD_VERSIONS_PG_REQUIRED=1 POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=15488 pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-reward-category-versions.pg.spec.ts`：1项真实PG查询/并发夹具通过；23版本分页、二人同基线发布仅1成功、旧事项版本引用保持、并发发布下header/items/count一致、空页/禁用/删除/foreign验证。随机数据库已删除，专用无卷容器停止且移除。其后仅错误文案/DTO名称非空/前端变更，不重复PG夹具。
- `pnpm --filter @jinhu/web exec vitest run --config vitest.config.ts test/interaction/hr-reward-category-versions.test.tsx test/interaction/hr-reward-continuity.test.tsx test/interaction/hr-reward-category-api.test.tsx`：最终21项通过，覆盖实际父页面同步锁和成功/刷新失败拆分；原360整合回归39项通过（之后新增1父页面用例并修改CSS/中文文案）。
- `pnpm --filter @jinhu/web test:unit:hr`：222项通过；API/Web typecheck、相关eslint、最终API/Web build通过。Web构建既有Next ESLint插件提示及无关canteen-peripherals未使用disable警告，不作无关修改。
- 实际版本组件+共享全局DS，合成接口桌面/390px：失败保留名称/制度说明；表单留白及历史卡片正常；390px iframe实际clientWidth385/scrollWidth385，按钮最小44px。临时tab/server关闭，无viewport残留。

证据目录：/Users/mac/.codex/artifacts/hr-reward-category-versions-20261009。未执行新迁移/全套fresh-schema、历史导入重放或生产业务测试写入：本片无DDL；query fixture不替代原迁移/实际角色签署或Windows/集团Web业务等价。完整CI、合并、生产部署清理和运行版本仍另行核验。
