# 保险政策持续导入适配

当前保险适配候选已接入共享协议、公共 DTO/服务、统一构包程序、受控staging和工作台文件识别，尚未合并或部署。不能将候选接口或本地测试当作真实新来源已接受。

统一构包程序新增可选 `insurancePolicyRecords`（完整原始51字段行与身份/行摘要）及 `insurancePolicyBaselineWitnesses`（按 `sha256:<source identity>` 索引的一次性原始证明）。固定入口、配方摘要及覆盖范围由 `docs/hr/yuzhou-import-interface.v1.json` 自动导出；摘要变化要求使用当前规则文件，不能静默接受过期配方。

受控staging配置可提供 `insurancePolicyManifest` 和可选 `insurancePolicyBaselineWitnesses` 私有文件引用。保险 manifest 需声明 `artifactKind=yuzhou_insurance_policy_raw_stage`、`sourceEncoding=canonical-json`、与sourceCustody一致的sourceSnapshotSha256及 `domains.insure_method` 的文件、行数和字节摘要；原始文件名为 `insure_method.jsonl`。保险使用正常 JSON 编码，不能将旧T5双反斜杠编码混入，也不能把已经归一化的T3子分项当作原51字段。入口继续核对每行摘要、行数和稳定身份。原证明可由已有 prepare-yuzhou-initial-baseline-witness.mjs 自动装配，真实封存来源接纳仍待单独验收。

## 固定规则与正式目标

复用已审定 `dbo.insure_method` 的 51 字段：id、des、rightscope，以及六险种四分项的百分率和固定附加额。来源身份沿用 SHA256(`dbo.insure_method` + NUL + 原整数 id)，与抽取时间、文件或月份无关。百分率精确除以100，固定附加额独立保留；NULL 与零不混同，不经浮点或非零舍入。同格式批次不重做全量历史分析、切片或 A/B；仍自动验证结构、摘要、关联、权限和现代维护冲突。

正式目标为现有 `hr_insurance_policy` 与六条 `hr_insurance_policy_item`。需要当前园区的保险读取、金额读取和独立政策版本创建权限全部具备；不能用员工管理权限代替。政策参考数据不自动激活，不推定有效期间、人员资格、参保分配、基数或财务期间，不修改已经冻结的现代政策版本。现代版本、期间及工资业务验收仍独立保留。

## 原始数据接纳与后续更新

原已导入来源必须匹配成功 T3 operation、phase、原逐行 record、projection receipt、migration batch 和唯一有效来源映射。政策及六分项的见证由原生产目标算法验证，六条准确 policy 依赖必须指回同一父来源。原51字段哈希和百分率/固定金额的逐项一致性同时核对。

初次接纳保存经过认证的原来源/目标字段基线与完整见证，加密存入账本；现代当前值只用于冲突比较和并发版本检查。后续同一来源可从已保存见证自动认证，不要求每批重新提供见证或重跑 A/B。变更见证被拒绝。未知原基线的记录报告 `INITIAL_FIELD_BASELINE_UNKNOWN`，不重复创建或拿现代值定基线；未完成或隔离映射报告原映射尚未解决。

旧12分项恢复在原候选构建阶段执行；应检查真实封存投影和原回执是否已归一为6分项。现有验证器只接受经过原摘要认证的规范化6分项，不猜测真实旧单位或补造恢复凭据。

来源未变化的字段保留现代维护；来源独立变化只更新无冲突字段；同字段双方不同变化记录冲突，不推进已接受来源基线。来源与现代值收敛时接受新来源事实，不强制增加业务版本。父政策版本、完整元数据摘要和分项身份/版本/数值摘要共同进行 CAS。

## 事务、隐私与数据库约束

候选前向迁移 `000341_hr_incremental_insurance_policy.sql` 不修改已应用迁移。新来源项的明文 field/target baseline 必须为空，加密来源及加密目标基线均必需；稳定来源、正式目标和创建人绑定到同 tenant/park。绑定不可更新或删除，来源身份不可改写；延迟约束要求业务事务提交时绑定存在。

提交按来源身份串行，在同一事务完成正式政策写入、来源账本、字段修订和实际 AuditService 必需审计。任何晚期失败均回滚。公开预览及修订只含字段名、摘要、结果和版本，不含原比例、金额或范围文字。相同操作/来源事实重放返回原结果；公共包层还必须独立验证包摘要、终态重放及所有模块权限。

## 当前验证

最终合并验证29组通过：20组实际 PostgreSQL、8组unit及1组现有静态契约。实际PG包含原生产writer独立摘要、原回执拒绝矩阵、原政策一次性接纳、无再次见证的更正、现代维护保护、同来源并发、选择性CAS、NULL/精度、实际审计失败整笔回滚、明文基线拒绝和绑定不可变。执行未修改的原导入控制、目标、账本迁移及新341；员工/用户前置为合成最小表，审计表由实际实体建立，此PG测试夹具本身未执行全库迁移链；完整迁移链另在独立空库验证。测试使用受限loopback临时库，结束断言本次数据库残留0。API类型、定向lint及差异检查通过。

日志为私有 `/tmp/yuzhou-insurance-public-final-20261005.log`。重跑需显式启用 `HR_INSURANCE_IMPORT_PG_REQUIRED=1`、`HR_INSURANCE_BASELINE_PG_REQUIRED=1`、`HR_INSURANCE_EXECUTOR_PG_REQUIRED=1`，配合本地loopback PostgreSQL；测试不得指向生产或现有业务数据库。

新增公共链路验证：13组实际PG通过，含固定builder→公共DTO预览/提交/终态重放/查询、逐模块写/读权限、混合包拒绝及原政策DTO见证接纳。工作台25组通过，保险摘要显示50个字段标签且不显示比例、范围或名称来源值，三项管理权限逐项缺失均拒绝。离线保险投影/构包/接口一致性/培训回归14组通过，受控staging72项检查及接口2组通过。以上为候选本地证据，尚非生产发布或真实来源接受。生产浏览器当前为登录页，桌面/手机真实岗位验收待完成。

下一步：用真实原封存工件验证一次性政策证明；验证CI和最新基线发布；生产SHA/健康/清理与既有数据保全、真实新来源和岗位验收分别取证。完整HR功能复现和独立产品验收尚未完成。

## 一次性原保险证明装配

复用 `prepare-yuzhou-initial-baseline-witness.mjs`，保留 `--plan`、`--payload`、`--package`、`--out` 四参数，并新增可选 `--original-insurance-source`。该文件是原批次 canonical JSON 原始行封套数组（sourceTable、sourceKey、sourceIdentitySha256、sourceRowSha256、source），不是本次修改后的原始数据。文件权限0600，输出目录0700；工具仅离线构包，不访问数据库或授权生产写入。

T3证明逐项验证原封存文件/包摘要、父政策、六分项身份与唯一依赖、原行摘要、目标摘要及百分率/固定金额。拒绝旧12分项、错误单位、缺失原始值和错误绑定。来源新行不附原证明；已有行首次接纳后由服务保存认证基线，后续批次不必重复提交证明。构包状态为 PREPARED_NOT_ACCEPTED，服务仍需与真实原回执独立认证。

工具契约7项通过，含原T0兼容、实际私有CLI、T3完整证明、篡改和旧单位拒绝。此证据使用合成封存材料，尚未证明真实生产原材料装配成功。

独立空库通过正式 `scripts/db-migrate.sh`：335个文件、8个前置步骤成功，最后000341，public表469个。API `pnpm --filter @jinhu/api build` 通过。完整链证据为本地临时数据库，不能替代生产迁移、运行时SHA和业务验收。

完整迁移重跑通过：335文件、8前置步骤均按原校验和跳过，零新增执行、零失败。本次临时Compose容器和网络均已移除，未使用生产连接。
