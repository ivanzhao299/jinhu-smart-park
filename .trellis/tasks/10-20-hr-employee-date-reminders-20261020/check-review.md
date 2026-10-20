# 独立整包检查：员工重要日期提醒

日期：2026-10-20。工作区：`/Users/mac/.codex/worktrees/hr-payroll-monthly-ingress-20261020/jinhu-smart-park`。分支：`codex/hr-employee-date-reminders-20261020`；实施基线：`24c4783099201100a049a2fe0acbb9c9ea46ac65`。

## 结论

已完整读取 trellis-check 技能、任务 PRD/design/root-boundary-review，并实际读取全部新增产品文件和已有文件 diff。覆盖 API 服务/DTO/控制器/模块/通知、382迁移、44种子、共享权限与独立runtime目录、API client/menu、页面及状态资源钩子/样式/交互测试。按 API/shared/Web 规范检查了权限、当前关系、事务、跨home身份、准确消息链接、迟到响应、不可变历史与独立初始化。

本轮发现的五项实际问题均已由 root 修复；修复源码已复核，补充反例已通过。**截至本次源码复核，无遗留阻断级发现。** 此结论是源码与明确测试覆盖的检查结论，不替代 root 的正常 HTTP、桌面/390px浏览器、独立初始化和后续发布验收。

## 本轮发现及修复回证

| 优先级 | 实际缺陷与触发条件 | 修复位置与复核结果 |
| --- | --- | --- |
| P1 | capability 查询把权限实体 home park 强制等同当前企业，并排除跨park tenant role。正常企业角色引用 tenant-wide 权限目录时，有效收件人被漏发或错误取消。 | `apps/api/src/modules/hr/hr-employee-reminder.service.ts:192`，现按正常 principal 规则使用 tenant/id 身份、当前scope role-permission链接，以及 tenant role 或本scope park role。PG新增跨home user、跨home permission、park/tenant role两分支均通过。 |
| P1 | 曾是HR的账号降为self后，原recipient键仍让其读取所有其他员工的已取消提醒；未绑定身份也继承旧HR可见范围。 | 同服务 `:71`，self SQL新增当前员工绑定与目标employee一致条件，同时保留本人离职/删除后的取消历史。PG新增 HR→self 降权反例，列表为0、旧他人UUID详情404，通过。 |
| P1 | 独立HR安装清单未运行新表DDL，共用HrModule已暴露新API，正常独立初始化/升级后访问会报缺表；独立权威菜单也漏新页面。 | `database/hr-enterprise/install-manifest.json:42` 追加共用382与独立000009权限定义步骤；`packages/shared/src/hr-runtime.ts` 增route/中文名，permission-catalog新增7项。所有安装step的SHA256已独立本地核对通过，既有kernel/step未改写。实际fresh/upgrade执行由root负责。 |
| P2 | 打开未读消息时，新详情读取与标记消息并行；标记成功后的旧render `detail.reload`会中止新详情、把资源状态改回旧key，留下永久loading。 | `apps/web/app/hr/employee-reminders/HrEmployeeRemindersClient.tsx:22` 在abort/generation/setState之前拒绝过期key回调。root新增延迟消息read、详情先加载后回执才到的交互测试，确认姓名/历史仍保留，报告8项交互通过。 |
| P2 | production seed把页面权限也注册为不可见button/30、无frontend_route，正常API权威菜单会丢失新入口，Web静态目录无法补救。 | `database/seeds/production/000044_hr_employee_date_reminders.sql:5` 页面独立写menu/20/visible=true/frontend_route，冲突更新同步以上字段。源码复核通过；root报告ownedlab已应用。 |

## 测试与证据

本轮检查代理只新增/修改两份自己负责的API测试与本报告，未修改产品、迁移、Web或其他任务文档。

- `apps/api/src/modules/hr/hr-employee-reminder.spec.ts`：8项无DB测试实际执行全过。新增未来闰日入职窗口边界；原7项包含日历、严格DTO、控制器权限与真实重放拦截器。
- `apps/api/src/modules/hr/hr-employee-reminder.pg.spec.ts`：现14个实际PG子项；新增role_scope fixture、跨home/tenant-wide权限与tenant-role，以及降权历史范围反例。root是唯一DB运行者。
- 已只读核对 `/Users/mac/.codex/artifacts/hr-employee-date-reminders-20261020/pg-reviewed-v4.log`：14子项+外层计数共15测试，15通过、0失败、0跳过；覆盖真实DDL、消息持久化、回滚、当前成员/关系/权限、并发去重、历史不可变和窄HR消息入口。
- 检查代理实际执行两份API测试文件的ESLint，通过；PG文件非opt-in加载通过且明确跳过，未自行操作数据库。
- 检查代理通过Python逐文件校验当前独立install manifest SHA256，并校验catalog恰好有7个本包权限、新页面准确route，均通过。
- root报告API/shared build、正常runner382与seed44通过；检查代理未重复运行全套构建或数据库流程。

复跑入口（已有授权的owned隔离环境，凭据由root私有环境提供）：

```sh
HR_EMPLOYEE_REMINDER_PG_REQUIRED=1 POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=<owned_non5432_port> POSTGRES_DB=postgres TS_NODE_TRANSPILE_ONLY=true pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-employee-reminder.pg.spec.ts
```

## 独立成员引用与恢复清单边界

- `member-reference-manifest.json`明确绑定原kernel SHA及97个旧 `(tenant_id,park_id,user_id)` home FK转换。382的新recipient/actor直接引用 `(tenant_id,id)` 历史身份，实时成员资格由scope port筛选；跨home反例已经验证。不得把新表混入旧清单或改写000006/000007/kernel。
- `scripts/hr-enterprise/verify-restored-pair.mjs:108`按每份配对快照manifest动态核对完整实际table set，并逐项核对当前install steps；没有固定kernel table allowlist阻止新表。新版本配对快照必须包括新提醒及动作表并绑定新install hash。
- 旧配对快照manifest与新install hash不一致时继续fail closed是正确行为，不应改写旧快照/回执或把旧恢复通过沿用为新版本证据。
- `observeRestoreCatalog`扫描所有public routines，会记录新增不可变动作trigger函数；旧function-acl-manifest是原基线子集校验，无需改写旧ACL步骤。未来恢复仍须生成和校验新配对catalog。

## 剩余验收责任

本检查代理未运行DB/Docker/API/Web服务器、生产写入、部署或浏览器；未读取私有凭据。正常JWT/HTTP业务旅程、桌面与390px检查、独立fresh/upgrade实际执行、发布SHA与健康/清理证据继续由root完成并记录。新版本实际恢复演练不在本次检查中执行，不能声称已通过。真实岗位使用和旧系统全部规则等价仍不由合成测试替代。

## 最后一次限定Web复核

2026-10-20，按root要求仅检查新增布局、提前天数筛选和测试修订，不重新执行API/PG、不启动环境。

- 两个记录区域现使用共享 `ds-scene-grid` 容器与 `ds-mobile-record` 卡片。已对照 `globals.css`：旧 `ds-mobile-record-list` 在桌面为 `display:none`，新容器为真实grid；修改直接消除了桌面数据存在但不可见的问题，未引入页面局部颜色/边框体系。
- 正常页和权限拒绝页均复用既有 `hr-workbench.module.css` 的page类。该类提供桌面22px面板留白、窄屏18px及min-width/换行；普通按钮采用共享secondary变体，生成操作保持primary，样式职责清晰。
- 提前天数筛选拆为 `windowDraft` 和已应用的 `windowFilter`。输入支持空值或0–365整数，设置number/min/max/step和聚焦全选；非法草稿禁用应用按钮，不改变API查询参数。明确应用后才更新过滤并回到第1页，分页及其他过滤不被草稿键入反复触发。
- 交互测试的下一页按钮匹配改为 `/^下一页$/`，避开不受支持的ByRole `exact`选项，同时保持精确业务按钮选择。
- 本轮实际执行 `git diff --check`，通过。未重复已有8项Web交互、API/PG或构建。

本轮源码复核未发现新增阻断。root提供的最新实际验收结果：桌面1440px的scrollWidth为1440、30张可见卡片；手机390px的scrollWidth为390；手机确认→完成→两步办理历史回读成功；8项Web交互通过；正常HTTP六角色旅程与独立fresh/upgrade/replay通过。以上运行/浏览器结果由root执行并保管合成数据证据，本检查代理不冒称亲自运行。
