# 公寓、资产与能源数据基线盘点

## 用途

该工具只读检查物理资产 `asset_unit`、运营房号 `biz_unit`、公寓配置与占用投影、房号能源表计之间的数据完整性。它不修复数据，也不改变数据库结构。

## 安全要求

- 生产环境必须使用只读 PostgreSQL 账号。
- 工具在 `BEGIN TRANSACTION READ ONLY` 中执行，并设置语句和锁等待超时。
- 工具只向终端标准输出写报告，不自动在仓库中生成文件。
- JSON 报告可能包含租户、园区、资产和房号 ID。需要留档时应重定向到受控目录，不得提交到 Git。
- 不要在命令行回显或日志中记录真实 `DATABASE_URL`。

## 执行

人可读报告：

```bash
DATABASE_URL='<read-only-postgresql-url>' pnpm db:audit:apartment-assets
```

JSON 报告：

```bash
DATABASE_URL='<read-only-postgresql-url>' pnpm db:audit:apartment-assets -- --json
```

调整样例数量和超时：

```bash
DATABASE_URL='<read-only-postgresql-url>' pnpm db:audit:apartment-assets -- \
  --json --sample-limit 20 --statement-timeout-ms 30000 --lock-timeout-ms 3000
```

`sample-limit` 范围为 1–100。样例限制在数据库侧执行，异常数量很大时仍只返回有限明细。

## 结果解释

| 检查代码 | 含义 | 建议处理 |
| --- | --- | --- |
| `ASSET_UNIT_WITHOUT_BIZ_UNIT` | 物理资产没有运营房号 | 判断是否需要转为运营房号 |
| `BIZ_UNIT_WITHOUT_ASSET_UNIT` | 运营房号没有物理资产映射 | 区分自有、代管、租入和外部房源 |
| `BIZ_UNIT_ASSET_SCOPE_MISMATCH` | 映射失效、跨租户或跨园区 | 阻断自动迁移并人工修复 |
| `UNIT_CODE_MATCH_ATTRIBUTE_CONFLICT` | 同范围同编码但名称或面积冲突 | 人工确定权威字段 |
| `APARTMENT_ROOM_WITHOUT_ACTIVE_OCCUPANCY` | 公寓配置缺少有效占用投影 | 核对生命周期后补建或退出管理 |
| `APARTMENT_ROOM_DUPLICATE_OCCUPANCY` | 同一公寓房号有多个未释放占用 | 释放重复记录并保留审计 |
| `APARTMENT_OCCUPANCY_LINK_MISMATCH` | 公寓配置与占用来源或房号不一致 | 阻断迁移并人工核对 |
| `APARTMENT_UNIT_WITHOUT_METER` | 公寓房号没有启用表计 | 能源闭环前补录或登记例外 |
| `ENERGY_METER_LOCATION_MISMATCH` | 表计和房号的范围、楼栋或楼层不一致 | 核对真实安装位置并修复关联 |

`critical` 表示后续自动迁移或能源闭环前必须处理；`warning` 表示需要分类，但可能存在合法业务例外。

## 失败行为

连接失败、必需表缺失、查询超时或任一检查失败时，工具会回滚只读事务、输出简短错误并返回非零退出码。部分检查成功不会被报告为完整基线。

## 建议运行顺序

1. 本地或备份恢复库验证命令和报告结构。
2. 使用生产只读账号运行并保存受控报告。
3. 对严重项逐条复核，对警告项分类为可自动匹配、属性冲突或合法例外。
4. 完成分类前，不收紧 `asset_unit_id` 约束，也不批量修改存量映射。
