# 员工档案版本冲突保护

档案读取在既有授权投影中返回已有 `version`（完整与脱敏读取均可携带）。PUT `/hr/employees/:id/profile` 必须显式提交整数 `expectedVersion`：现存档案使用读取到的正数；只有成功读取结果为 null 时，首次维护提交0。缺版本/非整数/负数被拒绝，不从服务端猜最新版本。

服务先锁定同scope的员工锚点，再锁定所有同scope档案行并派生活动集合。重复活动档案、仅有删除历史、预期不存在但已创建、预期存在但已不存在、版本不匹配均409且不修改任何档案字段或写入审计元数据。员工锚点串行首次创建；只有完全无历史档案时才可用0创建version=1。合法PUT显式递增一次，即使业务值不变，也使旧编辑版本失效。保持原PUT完整替换语义（可选普通字段省略即NULL，证件省略保留）和既有IdempotencyInterceptor。

前端从当前选中人员成功读取的档案携带版本。409后保留输入，禁止自动重试或覆盖，提示核对/复制编辑内容，再由用户明确选择“放弃本次编辑并重新加载”。版本缺失或读取失败不开放表单。普通submit事件用于保留失败时的非受控表单值，避免React form action完成后自动reset。

静态权限契约同时要求保存入口保留精确的 `canManageProfile` 与 `profileReadReady` 条件；CAS 的 `profileSaving`、`profileConflict` 和选中员工绑定检查只能进一步收紧该入口，不能替代、移动或放宽现有维护权限和读取准入。

PR805 的 Web 单元失败曾由旧正则只匹配无 CAS 状态的保存守卫引起，并非权限行为回归。`hr-employee-rbac-scope.contract.spec.ts` 现在同时断言 `profileSaving`、`profileConflict` 和选中员工绑定检查都与 `canManageProfile`、`profileReadReady` 位于同一拒绝守卫中；移除任一权限、读取或 CAS 收紧条件都会失败。聚焦契约 5/5 通过（`/tmp/hr-profile-cas-web-rbac-contract-r3.log`，0600，SHA-256 `d072cf7704277d495456fe8697bff35b33bab259c077fd45cbf3c53a1cfe71bd`）。整个 HR Web 单元集 174/174 通过（`/tmp/hr-profile-cas-web-unit-hr-r3.log`，0600，SHA-256 `c0efb4e692fa0d6c98a0c0477c78653d9f5bc6bed925e46831eb34fc5a0b7ed6`）。

后端新增VersionColumn不存在的列或迁移均不需要；本次不改导入账本、历史源、权限或账号。未来生产补值内核必须自行递增version（直接SQL不会自动运行TypeORM版本逻辑），回退也不能降回旧版本。CAS只是补齐前提，不代表生产修正或真实A/B完成。

发布须同时更新API与Web。旧客户端缺expectedVersion将被拒绝，需刷新获取新页面。不能先单独发布要求新字段的API再沿用旧Web。

聚焦验证：API版本DTO/服务单元、既有授权读取投影、真实TypeORM PostgreSQL隔离测试、员工页面交互测试。PG入口为 `HR_PROFILE_CAS_PG_REQUIRED=1 node --test --require ts-node/register src/modules/hr/hr-employee-profile-version.pg.spec.ts`（在apps/api、使用已有依赖）。该测试只启动一个全新随机Docker容器与随机数据库，使用实际entity metadata建局部表；验证两独立连接的确定性锁等待、首次创建/现有更新竞争、精确版本递增、陈旧请求无更新/无事务内probe审计。它不是完整迁移或生产证据。容器终于清理；无持久卷/自定义网络。

## 本地验证回执（2026-10-03）

候选工作树为 `/Users/mac/.codex/worktrees/yuzhou-profile-version-cas-20261003`，提交基线为 `878c4f39b6487df0b0612c3aeba2080bb5dedf3d`。以下命令均以该工作树中的源文件和 TypeScript 配置执行；日志只含合成夹具，不含人员、凭据或生产数据。

- API 聚焦单元：在 `apps/api` 执行 `PARTY_DATA_ENCRYPTION_KEY=<test-only-redacted> node --test --test-reporter=spec --require ts-node/register src/modules/hr/hr-employee-profile-version.spec.ts src/modules/hr/hr-employee-basic-profile.service.spec.ts src/modules/hr/hr-employee-profile-scope.spec.ts src/modules/hr/hr-access-policy.spec.ts`；33/33 通过。日志 `/tmp/hr-profile-cas-api-cas-unit.log`，SHA-256：`67d5b50ec7821a185dbef8776d0d8951f0ab911191f8d592b07574a4e3566864`。
- API 类型检查：`node /Users/mac/Documents/jinhu-smart-park/node_modules/typescript/bin/tsc -p /Users/mac/.codex/worktrees/yuzhou-profile-version-cas-20261003/apps/api/tsconfig.json --noEmit`；通过。日志 `/tmp/hr-profile-cas-api-local-typecheck-final.log`，SHA-256：`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。
- API 聚焦 ESLint：在 `apps/api` 执行 `node /Users/mac/Documents/jinhu-smart-park/node_modules/eslint/bin/eslint.js src/modules/hr/dto/hr.dto.ts src/modules/hr/hr-access-policy.ts src/modules/hr/hr.service.ts src/modules/hr/hr-employee-profile-version.spec.ts src/modules/hr/hr-employee-profile-version.pg.spec.ts`；通过。日志 `/tmp/hr-profile-cas-api-local-lint.log`，SHA-256：`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。
- Web 类型检查：`node /Users/mac/Documents/jinhu-smart-park/node_modules/typescript/bin/tsc -p /Users/mac/.codex/worktrees/yuzhou-profile-version-cas-20261003/apps/web/tsconfig.typecheck.json --noEmit`；通过。日志 `/tmp/hr-profile-cas-web-local-typecheck-final.log`，SHA-256：`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。
- Web 聚焦 ESLint：在 `apps/web` 执行 `node /Users/mac/Documents/jinhu-smart-park/node_modules/eslint/bin/eslint.js app/hr/employees/HrEmployeesClient.tsx lib/hr-api.ts test/interaction/hr-employee-profile-load.test.tsx test/interaction/hr-employee-profile-summary.test.tsx`；通过。日志 `/tmp/hr-profile-cas-web-local-lint.log`，SHA-256：`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。
- Web 交互：Vitest 3.2.7，`hr-employee-profile-load` 与 `hr-employee-profile-summary`；27/27 通过，覆盖缺失版本不开放表单、null 才允许零版本首次创建、409 保留编辑且显式放弃重载、读取失败/脱敏/跨员工拒绝维护以及完整投影承载。为使复用的测试依赖与当前页面使用同一 React 实例，运行时仅用临时 Next Link 测试替身；该文件在结束前已删除，未改产品代码或依赖。日志 SHA-256：`3a8a503a4afe8a9653fcc18b4c1bfe1ff72cf529874598d67217ebe970ceb541`。
- TypeORM PostgreSQL：在 `apps/api` 执行 `HR_PROFILE_CAS_PG_REQUIRED=1 PARTY_DATA_ENCRYPTION_KEY=<test-only-redacted> node --test --test-timeout=120000 --test-reporter=spec --require ts-node/register src/modules/hr/hr-employee-profile-version.pg.spec.ts`；5/5 通过，实际耗时约 14 秒。回执确认随机容器已移除，命名卷和自定义网络均为 0。日志 `/tmp/hr-profile-cas-pg-final.log`，SHA-256：`236e99a0df2e9554738df9ca362482a7ed314720c0d6cda861e4f42c625694e1`。

本轮没有运行迁移、生产库、导入、部署或真实岗位账号。CAS 只确保后续人工核对能够安全保存；当前已知的 79 个歧义档案及其中 13 个未离职人员对工资、社保的影响仍未评估，不能据此文档宣称资料、工资或社保已修正。

## 软删除历史复核（2026-10-03）

审查发现旧查询先过滤 `is_deleted=false`，会让只存在软删除历史的员工被误判为首次创建。现在同一事务锁定该员工同 tenant/park 的全部档案行，再派生活动集合：活动行大于一条仍拒绝；没有活动行但有删除历史也拒绝 `expectedVersion=0`；恰有一条活动行时，即使存在删除历史，匹配版本仍可正常更新。该修复不改变账号、权限、认证、导入或迁移。

- API 聚焦单元重跑：34/34 通过；日志 `/tmp/hr-profile-cas-api-unit-r2.log`，模式 `0600`，SHA-256 `c6e175ff5fc58e879c50407a0663961543f2b3c49b9ccde202da85d416bd8192`。
- PostgreSQL 重跑：6/6 通过，新增零版本删除历史拒绝且无 profile/probe 写入、活动行加删除历史允许更新；日志 `/tmp/hr-profile-cas-pg-r2.log`，模式 `0600`，SHA-256 `9b5cc339bd164c18718cf456e9312082e171e1a6c1ab962789f5737b7891b403`。随机容器已删除，命名卷和自定义网络均为 0。
- API/Web 类型检查、聚焦 ESLint 全部通过；日志分别为 `/tmp/hr-profile-cas-api-typecheck-r2.log`、`/tmp/hr-profile-cas-web-typecheck-r2.log`、`/tmp/hr-profile-cas-api-lint-r2.log`、`/tmp/hr-profile-cas-web-lint-r2.log`，均为 `0600`。四份 SHA-256 分别为 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`、`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`、`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`、`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。
- Web 交互重跑：使用保留的 `0600` 别名配置 `/tmp/hr-profile-cas-web-vitest-alias-20261003.ts`（SHA-256 `d656f17ad5cd1e385a67a1b86cd26dabaf573d3c45a9e3465766f3838b8138dd`）和 Link 替身 `/tmp/hr-profile-cas-next-link-20261003.tsx`（SHA-256 `ea5cc0eb9e2e61f72d39e42427209e3416c064b14868cc48277e603775255883`）执行 `PATH=/Users/mac/.codex/worktrees/yuzhou-profile-load-guard-20261003/apps/web/node_modules/.bin:$PATH vitest run --config /tmp/hr-profile-cas-web-vitest-alias-20261003.ts test/interaction/hr-employee-profile-load.test.tsx test/interaction/hr-employee-profile-summary.test.tsx`；27/27 通过。日志 `/tmp/hr-profile-cas-web-interaction-r2.log`，模式 `0600`，SHA-256 `5f478a96845a6d6fcc0d73c2aacb641854c0bfd1a9e06067f166a0c33e08e0ff`。

## 实际组件浏览器验证

2026-10-03父代理在IAB加载当前 `HrEmployeesClient` 与实际 globals/module CSS，采用合成员工/API/授权边界，未使用真实账号或人员资料。共享globals先于模块样式，匹配应用布局加载顺序。临时Vite预览无产品文件修改。

实际DOM测量：1280 CSS像素视口scrollWidth1275，390 CSS像素视口scrollWidth385，无横向溢出。浏览器已有缩放，按innerWidth校准视口而非仅依赖请求尺寸。两种尺寸验证409保留输入、保存禁用、显式放弃重载读取最新值。证据与预览源码哈希在任务research/s1-profile-cas-browser-verification-20261003.json，临时原始回执 `/tmp/yuzhou-cas-browser-preview/receipt.json`。截图 `/tmp/yuzhou-cas-browser-preview/mobile-conflict.png`、`desktop-reload.png`。临时服务及tab已关闭，视口已reset。

此证据只覆盖实际组件合成边界；不是完整Next运行环境、生产角色UAT或业务验收。
