# 共享房产底座

> 实施状态：开发中
> 首次实现迁移：`000176_shared_property_foundation.sql`

## 1. 领域边界

共享房产底座不新建第三套房源主数据：

- `asset_*`：物理资产、空间结构和静态属性。
- `biz_unit`：经营房源锚点，现有商业合同、工单、能源及后续长短租均关联该 ID。
- `biz_unit.asset_unit_id`：物理资产到经营房源的一对一显式映射；租户和项目范围由组合外键保证一致。
- `biz_property_operation_config`：经营模式和可经营状态。
- `biz_property_occupancy`：跨业态统一占用账本。
- `biz_party` / `rel_party_role`：个人或组织业务相对方及其业务角色，不属于 SaaS 系统租户。

首期经营粒度仅支持整套 `biz_unit`，不建立房间或床位库存。

## 2. 经营模式

经营模式为：

- `none`：未进入长租或短租经营。
- `short_stay`：民宿短租。
- `long_rent`：住房长租；现有园区商业租赁也按长租侧冲突处理。

模式只能通过 `POST /api/v1/property/units/:unitId/mode-transitions` 切换。直接修改经营配置不能改变模式。

切换在数据库事务内锁定经营配置，并记录：

- 切换前后模式。
- 切换原因。
- 操作者和时间。
- 前置检查快照。

阻断检查包括：

- 当前或未来统一占用。
- 与目标模式不兼容的长租或短租占用。
- 维修、保洁和运营锁房占用。
- 未结束的商业租赁合同。
- 待退租或待结算记录。
- 未关闭工单。
- 未结清应收事项。

切换不删除订单、合同、账单、角色或占用历史。

## 3. 统一占用

占用时间统一使用 `[start_at, end_at)`：

- `start_at` 包含在占用期内。
- `end_at` 不包含在占用期内。
- 前一占用的 `end_at` 可以等于后一占用的 `start_at`。

有效占用状态为：

- `held`：临时锁定，必须提供未来的 `hold_expires_at`。
- `active`：正式生效。

释放后的历史使用 `released`、`completed` 或 `cancelled` 保留，但不再阻塞可用性。

并发保护分为两层：

1. 服务事务锁定 `biz_unit`，查询统一占用和现有商业合同冲突。
2. PostgreSQL GiST exclusion constraint 阻止同一租户、项目和整套房源的 `held`/`active` 时间区间重叠。
3. 统一占用和历史商业合同房源关系共享事务级 advisory lock；双向触发器在提交前重新检查另一侧，防止两个入口并发写入造成跨表重叠。

服务将 PostgreSQL `23P01` 和相关唯一冲突转换为稳定的 HTTP 409 业务冲突。

现有商业合同暂不批量回填占用表。可用性查询实时读取 `rel_leasing_contract_unit` 和 `biz_leasing_contract`，将合同结束日转换为次日零点，从历史闭区间兼容为共享账本的半开区间。

## 4. 业务相对方与隐私

`biz_party` 支持 `person` 和 `organization`。住客、租客、同住人等角色由 `rel_party_role` 表达，不复制个人档案。

证件号同时保存：

- AES-256-GCM 加密密文。
- 用于同项目去重的 HMAC-SHA256。
- 默认 API 返回的脱敏投影。

只有 `party:sensitive_read` 权限可以读取解密后的证件号。新增和修改接口关闭请求体审计捕获，通用审计清洗同时屏蔽证件字段。

部署环境必须设置 Party 专用的版本化 keyring，运行时不得回退到其他域或 JWT secret。密文 metadata 独立记录 key id；读取按 key id 双读，新写入只用 active key。逐 tenant/park 轮换通过 scope lock、幂等 receipt 与 required audit 执行，异常整 scope 回滚。身份 HMAC 使用独立稳定的 fingerprint key；更换 fingerprint key 需要独立 hash migration，不能冒充 AES 密钥轮换。

## 5. API

| 能力 | API |
|---|---|
| 经营配置详情 | `GET /api/v1/property/units/:unitId/operation` |
| 物理映射及可经营状态 | `PUT /api/v1/property/units/:unitId/operation` |
| 模式切换 | `POST /api/v1/property/units/:unitId/mode-transitions` |
| 模式切换历史 | `GET /api/v1/property/units/:unitId/mode-transitions` |
| 占用列表 | `GET /api/v1/property/occupancies` |
| 可用性检查 | `POST /api/v1/property/occupancies/availability` |
| 创建锁定/生效占用 | `POST /api/v1/property/occupancies` |
| 锁定转生效 | `POST /api/v1/property/occupancies/:id/activate` |
| 释放占用 | `POST /api/v1/property/occupancies/:id/release` |
| 相对方列表/详情/新增/修改 | `/api/v1/property/parties` |
| 相对方角色维护 | `/api/v1/property/parties/roles` |

所有写接口要求 `X-Idempotency-Key`；控制器同时使用 `IdempotencyInterceptor` 提供成功响应重放和冲突语义。

## 6. 后续接入约定

- 民宿订单在确认或锁房时创建 `source_domain=homestay` 占用。
- 住房租约在生效前创建 `source_domain=housing_rental` 占用。
- 维修、保洁和人工锁房分别使用 `maintenance` 或 `operations`。
- 各业务域释放占用时保留原 `source_type` 和 `source_id`，用于跨业态审计与分析。
- 民宿订单和住房租约状态机不得绕过统一占用服务自行判断房态。
