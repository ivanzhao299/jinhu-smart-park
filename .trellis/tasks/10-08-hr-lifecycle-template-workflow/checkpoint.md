# 完整生命周期模板流程检查点

## 目标与验收
完整1..50项模板编辑、排序/增删/必填/偏移，当前版本读取与不可变新版本发布，ASSIGN专用最小候选，失败草稿与身份/范围切换隔离。旧清单与员工/离职/任务办理契约保留。

## 工作区
/tmp/jinhu-hr-lifecycle-template-workflow-20261008，codex/hr-lifecycle-template-workflow-20261008，基线6985319d63e890454cc329f519b10ea5ff2d72ea。尚未提交。父会话培训PR878尚未合并，发布前由父同步新main。

## 已改文件
- apps/api/src/modules/hr/hr-lifecycle.controller.ts、hr-lifecycle.service.ts、dto/hr-lifecycle.dto.ts。
- apps/api/src/modules/hr/hr-lifecycle-template-workflow.spec.ts、hr-lifecycle-template-workflow.pg.spec.ts。
- apps/web/lib/hr-api.ts。
- apps/web/app/hr/lifecycle/HrLifecycleClient.tsx、LifecycleTemplateEditor.tsx、LifecycleTemplateManager.tsx、lifecycle-template.module.css。
- apps/web/test/interaction/hr-lifecycle-template-workflow.test.tsx、hr-lifecycle-employee-selection.test.tsx。
- API/Web hr-lifecycle-template-workflow.md及对应index插入；本任务artifacts/checkpoint。
- 父任务10-02-yuzhou-modern-production-parity/task.json既有改动由父所有，未触碰。

## 验证命令与结果
- pnpm --filter @jinhu/shared build：通过，自有producer输出。
- pnpm --filter @jinhu/api typecheck；pnpm --filter @jinhu/web typecheck：首次均通过。
- node apps/web/node_modules/vitest/vitest.mjs run --config apps/web/vitest.config.ts apps/web/test/interaction/hr-lifecycle-template-workflow.test.tsx apps/web/test/interaction/hr-lifecycle-employee-selection.test.tsx：18/18通过（新7+既有11），首次通过。
- HR_LIFECYCLE_TEMPLATE_PG_REQUIRED=1 POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=15483 TS_NODE_TRANSPILE_ONLY=true TS_NODE_PROJECT=apps/api/tsconfig.json node --test --require ./apps/api/node_modules/ts-node/register apps/api/src/modules/hr/hr-lifecycle-template-workflow.spec.ts apps/api/src/modules/hr/hr-lifecycle-template-workflow.pg.spec.ts apps/api/src/modules/hr/hr-lifecycle.contract.spec.ts：实际PG和既有5项通过；新权限测试首次误用PERMISSIONS_KEY读取RequireAnyPermissions，修正测试为ANY_PERMISSIONS_KEY后新4/4通过。10个唯一API/PG用例最终均通过。
- TS_NODE_TRANSPILE_ONLY=true TS_NODE_PROJECT=apps/web/tsconfig.json TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' node --test --require ./apps/web/node_modules/ts-node/register apps/web/app/hr/hr-lifecycle.contract.spec.ts：3/3通过。
- API受影响文件eslint通过。Web受影响文件eslint首次仅一个测试unused import，删除后该文件检查通过；源代码检查无问题。
- git diff --check：通过。

## 隔离与剩余事项
真实PG为owned127.0.0.1:15483/container jinhu-hr-lifecycle-template-pg-20261008，random database残留0、容器已删除。无活动runhandle。仅局部query/writefixture，fullmigration/immutabletrigger/全构建/全单测由发布CI覆盖，不当作完整迁移或生产UAT。
父会话已报告实际组件desktop双任务ASSET,DOCS排序提交及失败保留；390x844 iframe版本失败/重试成功V2流程、html clientWidth/scrollWidth均385，截图privateartifact/hr-lifecycle-template-workflow-20261008/{desktop-draft,mobile-version-draft}.jpg。该浏览器fixture是synthetic UI证据，数据库持久性由上述PG验证。父会话继续负责serialreview、main同步和发布；本实现者不提交/推送/合并/部署，无生产业务写入。所有文件写入交回，等待父review。

## Cost Summary
单实现者，未spawn。复用immutable service、候选scopehelper、当前employeeinteraction和依赖overlays；无fullinstall/锁文件修改。18交互与2typecheck首次通过；API只重跑metadata测试修正后的新4项，lint只重跑修正测试文件，未重复PG/全套。actual usage unavailable。

父同步最新main5a54010b274394b4e9ba2cd4c527389704106908：ownedstash恢复后API/Web规范索引顶部新增引用冲突，已逐项保留培训与清单两个引用；hr-api自动合并成功，无代码冲突。stash私有回执保留，下一步新基线serialreview/验证。

## Serial review PASS / writer released

基线5a54010b完成复核。修复模板summary/detail运行时校验、同模板关闭重开后的旧刷新回调、发布成功后的独立刷新错误。仅Web边界/反馈及回归/spec更新；API运行代码/DTO/SQL未改，原PG证据继续有效。新增`lifecycle-template-data.ts`。

最终API10/10、页面25/25（模板14+员工选择11）、API/Web typecheck及affected ESLint全部通过。第一次并行交互因host调度变慢触发5个默认5秒超时，完成原检查后仅串行重跑一次，25/25在2.41秒通过；未改仓库测试超时。日志`/tmp/hr-lifecycle-template-review/`，完整review.md含命令和限界。无活动句柄，全部写入权交回父会话；父负责最终源浏览器确认和发布，不扩展导入。
