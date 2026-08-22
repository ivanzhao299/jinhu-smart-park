# Issue #270 民宿住房 owner/scope 数据库加固

## 目标
用 forward-only migration 为民宿、住房遗留父子表补齐 tenant/park owner 复合约束，阻止数据库直写造成跨作用域关联。

## 要求
- 对目标表逐一做历史异常 preflight，异常时 fail-fast。
- 不修改既有成功迁移，不自动清理历史数据。
- 替换裸 UUID FK，纳入 Track-B migration/constraint gate。
- 补空库、升级库、合法写入和跨 scope 负向 PG 测试。

## 验收
- 跨 tenant/park 关联被数据库拒绝，同 scope 流程不回归。
- migration history/checksum、Track-B reconcile、release smoke 通过。
- Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/270
