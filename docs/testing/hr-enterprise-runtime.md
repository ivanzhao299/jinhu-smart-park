# 独立企业 HR 双模式验证

恢复后的数据库/附件内容检查见 [恢复内容配对核对](./hr-enterprise-restored-pair.md)。该入口不更新 runtime marker，不替代实际恢复启动、角色/结构核验或生产 RTO/RPO。

`node scripts/e2e/hr-enterprise-runtime.mjs` 必须传 `HR_ENTERPRISE_E2E_CONFIG=/private/owned-config.json`。没有配置、非0600文件、非loopback API/数据库、非精确匹配 `jinhu.hr-enterprise-runtime=<container>` label 的 `hr-enterprise-*` owned Docker 容器均失败，不静默跳过。配置 `allowSyntheticWrites:true` 只授权隔离测试资源，不能作为业务接口 trusted flag；服务端仍使用真实登录、权限、DTO、状态、CAS、审计和数据库幂等。

配置包含 `outputDir`（0700）、`jwtSecret`（synthetic前缀的测试签名密钥）及 `enterprise`/`integrated` 两组：`container,port,database,user,apiBase,tenantId,scopeKey,username,password`。两个 API 必须采用同一测试密钥，以实际验证 mode claim，不能把不同签名密钥的失败冒充模式隔离。密码只存私有合成配置，不提交。API 正常根入口与全部真实 guards/interceptors 启动；不能使用测试主体 stub 或 fake park。

独立库从空库执行 `scripts/hr-enterprise/init-db.mjs` 全 manifest，再通过显式 bootstrap 配置管理员。集成库执行真实 `scripts/db-migrate.sh`、production-safe seed、bootstrap-admin、baseline（均仅 owned 容器）；集成已应用迁移不得修改。启动两个实际 API 后运行完整矩阵。可用 `--phase=initialization|catalog|compatibility|enterprise|profile-continuity|integrated|delegation|multi-enterprise` 只补输入变化对应的分组；`profile-continuity` 只跑正式档案增量 HTTP 链，仍要求两组 exact-owned 数据库，`all` 不跳过任何组。

矩阵包括：

- 独立表范围/园区表缺失、32位 generated bridge、324个选中函数/过程的真实 ACL 和未变化内核定义指纹（唯一明确变更为企业 live actor predicate）。
- 集成旧无mode JWT成功；跨模式 JWT、refresh 和独立旧token失败；相同密钥下实际HTTP证明。
- 两模式正常组织/员工本人、入职转正、合同、考勤、工资规则版本/试算准备、绩效、培训、奖励及反馈持久化。工资仅合成规则准备，不发薪。
- 独立成员/角色维护、同键回放/不同body冲突、CAS、撤权/停用、不可授予角色、窄创建能力无额外名单读权、不能将既有高权限角色分配给受限成员。
- 真实主管绩效评价、校准/申诉至确认、不能自审/重复写；培训签到/完成/另一作者纠错生成通知；实际奖励和考勤二人审批。
- 跨租户/企业、非本人、super仍需成员、模块停用、必需审计失败回滚、并发处理中409后原键回放仅一条成员；敏感档案加密/掩码/写权限和附件关联/字节一致/跨本人拒绝。
- 规范化正式档案增量包通过真实 HTTP 走预览、提交、33字段 ValidationPipe、正常档案 `PUT`、后续来源更新和现代同字段冲突；窄档案读取角色可以读取该操作状态，但不能预览或提交。此项只使用新建的合成来源键和 owned 数据库，不能替代原始玉舟映射或生产岗位验收。

输出只有阶段、结果、0skip及资源句柄；完整原始日志/合成回执留私有目录。验证结束由唯一资源 owner 停止 exact PID、按 label 校验后删除 exact owned 容器，记录文件目录/容器清理或显式保留供独立浏览器审查。不要清理其他容器、全局Docker或生产数据。

构建门包括 Shared lint/typecheck/build、API lint/typecheck/build、受影响 identity/JWT/refresh/workflow/module/idempotency 回归及 Web对应检查。真实浏览器分别检查桌面与390px，生产真实岗位/旧源/全量工资/迁出恢复边界独立记录。CI正式 release-smoke仍按集成路径运行，不能用独立局部 green 替换。

集中多企业回归使用同一 A-home/B-member 身份，覆盖组织负责人、员工绑定、培训发布、奖惩提交、生命周期转派、招聘负责人选项/修改/历史、合同及三类提醒。撤销 B 成员后新提醒排除该收件人，历史作者仍可回读；home 停用后密码登录选择实时有效企业，无有效成员拒绝，恢复 home 后优先 home。多企业分组保存私有 resume；续跑结果与前序成功阶段分别报告，不将续跑计数当完整重跑。委派分组覆盖字段/旧字段/命名范围三写入口拒绝及无身份/角色关系新增，保留状态维护，移除限制后恢复原能力。
