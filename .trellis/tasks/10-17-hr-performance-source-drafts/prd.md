# 绩效资料正式草稿与增量修订

## 目标
完整正式承接D的第一项可写交付：来源资料可以经正常授权API进入正式、可编辑、保留修订的业务草稿；首次接入与后续补导共用入口，人工修改不会被补导覆盖。不是来源只读展示，也不冒充评价启用/业务审批。

## 已授权与范围
长任务/持续现代化开发已获用户授权，不再问月份、负责人、登录或常规实现批准。生产只读run38927701106已证明当前scope六类绩效来源均0，不创建生产样例；在ownedPG/HTTP真实验证写入与反例。父D全部manifest/正式模板/评价启用/UI/增量/真实岗位验收不缩减，本子任务不把未启用草稿报成可办结评价。

## 需求
1. 来源模板和评价候选分页；对任一候选读取同scope/batch完整六表事实集合及确切map/batch证据，确定性完整manifest，不截断101+明细/41+等级/重复item。所有decimal和源整数以字符串保留、timestamp without timezone保持本义；不通过JS Number读取源金额。
2. 来源不变，独立正式草稿+append-only修订+不可变共享manifest；保留全部62业务source字段及12hash声明的来源证据。一个source identity一个草稿；同人期间多master独立。初始资料、目录候选、可维护值及明确人员/组织/期间绑定可读写；稳定原身份/hash为追溯，不通过改身份达成编辑。
3. 创建、保存、补导具备真正幂等与业务去重：同key/body重放、异body409、不同key同source复用，不同key同head并发最多一个成功；source/hash/head变化409零覆盖。
4. 已有人为修订时补导返回具体冲突，不覆盖或清零。未人为修改可显式接受新manifest成新修订。每次人工修订真实actor/time/reason，保留旧manifest/值。
5. 模板草稿按TEMPLATE_READ/MANAGE，评价草稿按PERFORMANCE_READ/MANAGE及实际selected-park DB权限；源pay19,4在候选/详情/历史/manifest摘要响应均按salaryread交集投影，写按薪酬管理交集。无权限省略字段，保存其他字段时保持原薪资值。权限撤销即生效，audit不记录body/private values。
6. 不从来源推断日期/岗位/职责/审批。资料缺项可保存；qualification永远不能由客户端赋予。本子任务资格固定NOT_EVALUATED，不能冒充308/309/310或旧等价信用；启用阶段将在父D独立完整验证。
7. 本子任务无普通周期/input守卫变更；后续正常现代页面和receipt绑定启用必须继续实现。

## 验收
required owned PostgreSQL实际新迁移+真实HTTP ValidationPipe/PermissionGuard/Idempotency/Audit链路：完整集合/精度/null/源timestamp、首建重放/异body/业务重复、修订并发/来源漂移/人工修改保护、同人多master、跨scope/权限撤销/工资投影和保持、直接SQL伪造/改历史/不推进head拒绝。前后原facts/map/旧receipt及既有372guards指纹不变。
API/shared lint/typecheck/build及相关focused tests；不得用投影查询夹具冒充本子任务写入验收。正常Web入口/桌面390px与完整启用是后续同父任务必交付，不在本子任务宣布父D完成。
