# T4 实施清单：玉舟工资历史兼容与双轨核算

## 0. 基线与规划门禁

- [ ] 完成真实 SQL Server 工资 catalog/profile，冻结 35 表、46,092 实际行、2010～2026 期间范围、列目录、重复/空身份和金额摘要；将 source backup SHA-256、catalog hash、逐文件 hash 与 profile 版本写入受控 evidence manifest，数字只绑定该 manifest；禁止使用 `sys.partitions` 近似统计。
- [ ] 完成当前 Jinhu 工资 schema/API/Web/权限/审计复用审计。
- [ ] PRD、design、implement 和 implement/check JSONL 经独立审查。
- [ ] `task.py start` 前再次确认工作树与 `origin/main` 一致、迁移最高号无变化。

## 1. Slice A：历史工资规范化 schema 与迁移控制

- [ ] 新增前向 migration：账套版本、项目定义、公式版本、税率版本、旧关账、历史批次、历史工资条/明细、复核案例、双轨运行/差异。
- [ ] 所有 tenant/park owner FK、业务唯一键、完整 FK 索引、decimal 精度/scale/溢出 CHECK、状态 CHECK 和 append-only 保护齐全；应用角色无历史 UPDATE/DELETE，受控 rollback 仅能删除持锁的 unpublished/staged/failed 批次，published 批次不可删除。
- [ ] 新增 TypeORM entity，只暴露服务所需字段；历史事实无通用写 DTO/路由。
- [ ] Shared 原子权限和 production-safe seed：HR 最小授权、员工本人读取；负责人默认无工资金额权限。
- [ ] 静态 migration/seed/权限/投影合同测试。

## 2. Slice B：真实源抽取、转换、装载和回滚

- [x] `extract-yuzhou-t4-payroll-history.sh`：只读 ETL、显式列、稳定顺序/身份、两次确定性业务 hash 合同。
- [x] `transform-yuzhou-t4-payroll-history.mjs`：精确 decimal 字符串/缩放整数（禁止 JS `number`）、动态列目录、内容组 hash + multiplicity、重复检测、公式只做词法 profile 不执行、敏感报告脱敏；无稳定 locator 的完全重复组整体隔离，不伪造单行 ordinal。
- [ ] `load-yuzhou-t4-payroll-history.sh`：仅允许隔离 PG，固定 staging hash，事务装载，员工精确映射，source=loaded+quarantined。
- [ ] `rollback-yuzhou-t4-payroll-history.sh`：只按 active `legacy_record_map` 和本批次目标 ID 删除，子表到父表顺序。
- [ ] migration batch/item/error/check/rollback point 完整，重复 run 拒绝。

## 3. Slice C：历史查询和人工复核 API

- [ ] 园区/本人历史工资列表和详情采用服务端 park/self/none 范围；团队金额默认 none。
- [ ] 工资条、项目、公式、复核案例均使用精确 allowlist projection，不返回 source snapshot、内部 hash、tenant/park/audit/version 字段。
- [ ] required audit 在敏感响应前完成，失败阻断。
- [ ] 复核动作使用精确权限、幂等拦截、悲观锁、append-only action、`captureBody:false`。
- [ ] 分页、期间/账套/员工筛选只能缩小服务端范围。

## 4. Slice D：受限 DSL 与双轨差异

- [ ] 实现独立 lexer/parser/AST validator；禁止 SQL、函数、赋值、循环和动态变量。
- [ ] 解析状态 `parsed/manual_review/rejected/approved_for_simulation`，依赖闭环检测和 parser version 固化；只有人工批准状态可执行。
- [ ] parser 对表达式长度、token 数、AST 深度、依赖数、属性/原型访问设硬上限；除零、溢出、未知引用和资源超限 fail closed，7 条 `cit` 及全部跨域 HR 引用强制人工复核。
- [ ] evaluator 全程精确 decimal/缩放整数，显式舍入规则，禁止 JavaScript `number`。
- [ ] 双轨计算只写 reconciliation 表，模型/数据库不提供付款状态或可开启发薪的布尔开关，不写历史工资和在线 `hr_payroll_run/hr_payslip`，不复用现有确认/付款路由。
- [ ] 每次模拟在事务内冻结 employee/compensation/insurance/formula/engine 版本，并且考勤只接受 M6 `closed` 且当前 effective 的 payroll-input batch；求值期间禁止读取漂移的 live current 值。
- [ ] 逐员工/逐项目差异、容差、复核动作和版本链完整。

## 5. Slice E：生产化 Web 工作台

- [ ] `/hr/payroll` 拆分历史工资、规则复核、双轨差异三个简洁工作面，复用 DS surface。
- [ ] 员工本人历史工资条可分页查看并下钻项目；无权限时不请求敏感 API。
- [ ] HR 桌面支持异常与差异下钻；手机端不暴露批量敏感管理。
- [ ] 403、服务失败、空状态、分页和刷新语义独立；切换记录清理旧敏感详情。
- [ ] 桌面与 390px 浏览器验证无横向溢出、无冗长说明文字。

## 6. 数据库与质量门禁

- [ ] 从 PostgreSQL `template0` 建 fresh 数据库，运行全量 migrations 和 production seed 两次。
- [ ] upgrade 数据库从 `000247` 应用 T4 migration；migration raw replay 和约束 catalog 验证。
- [ ] 真实源抽取 A/B 业务 hash 相同；46,092 工资行、711 项目、244 公式、1,431 关账、647 账套成员关系和 9 税率证据全部守恒。
- [ ] 金额按账套/期间/汇总项核对；异常旧余额保留且进入复核，不被修正。
- [ ] load → rollback → reload 一致；重复 run 拒绝；按内容组 multiplicity 守恒且无稳定 locator 的重复组不发布；T0 员工状态、T3 考勤/社保和在线工资表零变化。
- [ ] API/Web 定向测试、PG races、shared build、全仓 lint/typecheck/build、diff-check 全通过。
- [ ] 独立 `trellis-check` 审查并修复所有有效发现。

## 7. 发布门禁

- [ ] 提交前 fetch；候选分支不落后远端且无不明 dirty 文件。
- [ ] PR CI、Release Smoke、migration/seed/check-init 全绿。
- [ ] 合并前再次 fetch，确认可合并且没有错误覆盖同事提交。
- [ ] 生产部署确认 merge SHA = workflow SHA = runtime SHA，健康/就绪和受保护账号通过。
- [ ] Docker 部署后清理完成；若跳过或失败必须显式报告。
- [ ] HR/员工浏览器 UAT 及手机宽度验证通过；生产仍无正式发薪入口。

## 回滚点

- schema 为前向迁移，不使用旧应用反向迁移。
- 隔离数据回滚仅删除 T4 loader 本批次且有 record-map 证明的目标行。
- API/Web 发布失败走应用版本回滚，但保留前向 schema；旧历史事实与旧系统均不写。
- 任何守恒、金额、权限或审计门禁失败立即停止，不进入 seed、部署或下一切片。
