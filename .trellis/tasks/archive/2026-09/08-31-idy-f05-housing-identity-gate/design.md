# Design: IDY-F05 Housing Identity Gate

## Boundary

`HousingHandoverCommandService.completeInTransaction` 在锁定租约并确认 `handover_type=move_in` 后、创建或完成 handover 之前，读取主承租人和 scoped occupants，调用住房专用 verifier。该调用与 handover 完成处于同一 `EntityManager` 事务。

## Canonical Verification Contract

- 在共享 `IdentityVerificationPort` 增加 `verifyForHousingMoveIn`，并用一个私有 canonical method 参数化精确 purpose；`verifyForCheckIn` 与 `verifyForHousingMoveIn` 分别固定传入 `accommodation_checkin` / `housing_move_in`。
- 住房适配器仍由 property-identity 模块实现，住房模块只依赖 port，不读取身份表字段或复制 SQL。
- canonical query 保留 tenant/park、Party current pointers、verified submission、identity version、processing restriction、current consent fact、snapshot/file locks与哈希/version 漂移校验。
- 住房入口固定要求 `housing_move_in`，调用者不能提交任意 purpose。

## Data Flow

`POST /housing/leases/:id/handovers` → DTO `move_in` → lock scoped lease → load `tenant_party_id` + scoped non-deleted occupant Party IDs → stable dedupe/sort → `verifyForHousingMoveIn(manager, scope, lease.id, partyIds)` → all evidence valid → persist completed handover。

任何 verifier 异常回滚整个事务。`move_out`、create、submit、approve、sign、activate 不进入该调用链。

## Compatibility

- 不新增 migration；`housing_move_in` 已在 000287 consent purpose constraint 中。
- 现有民宿方法与 `accommodation_checkin` 行为保持二进制/语义兼容。
- 现有错误码 `identity-snapshot-stale` 继续作为 fail-closed 公共错误；测试只断言安全错误码/HTTP 状态，不暴露具体 Party 的敏感失败细节。

## Tests

- verifier 单元/SQL contract：两种 purpose 精确分流，住房不能接受 accommodation consent，民宿不能接受 housing consent。
- housing command unit：仅 move-in 调用；主承租人始终包含；occupants 去重；任一失败不保存 handover；move-out 不调用。
- PostgreSQL 原子性：真实 Party/consent/submission/snapshot/file fixture 覆盖零/一/多 occupant、unverified、missing/withdrawn/wrong-purpose/not-yet-effective consent、version/file drift、all-valid。
- E2E：create/sign/activate 在未核验状态仍成功；move-in 反例失败，补齐有效 identity+consent 后成功。

## Rollback

应用层回滚为移除住房 handover 的 verifier 调用及新增 port 方法；无数据库逆向迁移。上线前后的数据事实保持不变。
