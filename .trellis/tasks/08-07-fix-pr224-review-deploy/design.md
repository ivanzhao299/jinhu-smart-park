# 技术设计

## 边界

本任务只修复 PR #224 的 Admin Issue/Runner 链路、其生产部署工作流和对应反馈 UI。数据库变更沿用失败的
`000190` 文件，不创建无法越过失败迁移的后续补丁；环境基线数据移动到新的 production-safe seed。

## 数据库与发布初始化

- `000190` 保留表和索引 DDL，删除全部 `sys_permission/sys_role/sys_user/rel_*` 数据写入。
- 新增 `database/seeds/production/000005_admin_issue_runner_baseline.sql`，使用事务和幂等 upsert。
- `sys_role` 身份遵循租户级唯一索引 `(tenant_id, code) WHERE is_deleted=false`；后续关系解析也按
  tenant + code 查找，避免园区字段与唯一契约分裂。
- Release Smoke 在 migration 后运行 production seed，并断言 Runner 账号保持 disabled、只绑定 runner 最小权限。
- CI 增加变更范围探测：PR 触及 migrations、seeds、db/deploy 脚本或 release-smoke workflow 时自动执行数据库 smoke。

## API 状态机与并发

- create/mine 使用 `ADMIN_ISSUE_CREATE`；detail 使用 create/read 任一权限，service 继续执行“本人或 read/super”资源校验。
- triage、renew、recordResult 都在 transaction + `pessimistic_write` 中读取目标行。
- 活动 CLAIMED 租约禁止 triage；expired claim 可被审核动作撤销后转换。
- renew 必须同时匹配 issue 状态、runnerStatus、runner_id、lease_token 和未过期时间，再延长 15 分钟。
- recordResult 只接受同样的当前活动租约状态；成功写回后清空租约字段，避免旧 token 再用。
- APPROVED 先计算 DTO 与存量合并后的最终 acceptance criteria，trim 后再校验和持久化。

## 证据合约

- validation evidence 保留通用 PASS 合约。
- release evidence 改为嵌套 DTO：`ci`、`deployment`、`production_health` 三个 gate 均要求
  `status: PASS`，允许携带 URL/commit/run 等审计字段。
- service 不接受只在根对象提供 `status`/`conclusion` 的旧宽松格式。

## 工作流安全与清理

- 激活 workflow 复用仓库标准 SSH agent + `ssh-keyscan` 步骤。
- 本地 hash 用 step-level shell trap 清理；远端命令以 trap 删除 hash 和临时激活脚本，成功失败一致。
- deploy snapshot 的状态机为：正常部署成功→删除；部署失败且 rollback 成功→删除；rollback 失败→保留并输出路径。
  路径仅由部署根和数字 `GITHUB_RUN_ID` 构造，不接受任意删除目标。

## Web

- 弹窗 backdrop/定位/局部排版仍由 CSS module 负责；面板、按钮、表单控件、移动记录使用全局 DS 类。
- mine/manage 各自重置到 page 1；请求保存 `items,total,page,page_size`，上一页/下一页按服务端 total 控制。
- 提交成功切换 mine 后重新加载第一页，避免把新记录拼进非第一页或产生错误总数。

## 兼容与回滚

- 生产 migration 失败且事务已回滚；部署新的修复 commit 后，runner 会警告 checksum 更新并重试同名 failed migration。
- 若任何长期环境已将旧 `000190` 标记 succeeded，checksum 门禁会阻断；该环境必须先人工核验，不能绕过。
- 代码回滚不会回滚已成功 schema；seed 为幂等，可重复运行。
