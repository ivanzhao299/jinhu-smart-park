# Design — M-01 资产投影生命周期对称化

## 边界与状态

`asset_unit` 是物理源，`biz_unit` 是运营对象。M-01 不合并两者，只补齐显式生命周期命令。

1. `mapped + operating enabled`：禁止删除源。
2. `mapped + blockers=0`：原子执行 `operating_status=disabled` + `asset_unit_id=NULL`，保留 `biz_unit` 与全部业务历史。
3. `unmapped` 或 `mapped + biz_unit.status!=1`：允许源软删；仍绑定的 disabled 投影作为历史关联保留，不能重新生成第二条投影。
4. `asset soft-deleted`：restore 同一行；若历史关联仍存在，父链和 active unique constraint 再次验证一致性；若已显式 unlink，保持未绑定。

## API 与事务

- 新增 `POST /assets/units/:id/restore`，沿用 `ASSET_UNIT_UPDATE` 权限和 AuditLog。
- Property operation 配置继续作为显式停用/解绑入口，不新增重叠 endpoint。仅当同一请求为 `operating_status=disabled` 且 `asset_unit_id=null` 时进入 decommission 校验；禁止 enabled/suspended 状态直接解绑。
- `configure` 在事务内先 `lock_property_unit_scope`，再锁 `biz_unit`、config 与 asset mapping key，构建目标 `none` 的 blocker snapshot；存在 blocker返回结构化 409。
- 成功路径按固定顺序更新 config，再 unlink；同一事务失败全部回滚。unlink 继续要求幂等键并写 append-only audit。
- 删除/恢复使用 asset-space advisory lock，确保与 link/unlink/convert 串行；恢复按 `is_deleted=true` 查找，仍执行 data-scope 约束。

## 恢复一致性

- restore 不从名称/code 猜测 projection，也不从旧 audit 自动重绑已显式解绑关系。
- 如果 soft-delete 期间仍有 disabled 关联，恢复前锁并验证该 `biz_unit` 的 tenant/park、父映射和唯一性；验证失败返回 conflict，源保持 deleted。
- 若无关联，只恢复源行。后续可通过既有显式 link/convert 工作流建立新关系。

## DB 论证

现有复合 FK、active mapping unique index、父链 trigger 与应用 advisory lock 已能封闭 link/delete/restore 竞态。PostgreSQL FK 不感知 `is_deleted`，而 D-02 是业务状态规则；用 trigger 阻止软删会复制复杂 blocker 逻辑且难携带 actor/audit。因此默认不新增迁移。若 PG 竞争测试证明绕过窗口，再新增单独 forward-only migration，不修改 `000176`/`000218`。

## 兼容与回滚

- 现有单纯配置状态更新保持兼容；只有解绑被收紧。
- 历史 audit action schema不变，避免迁移；restore 由通用 AuditLog 记录。
- 回滚代码不会删除已产生的 unlink audit；重新 link 必须走既有显式命令。
