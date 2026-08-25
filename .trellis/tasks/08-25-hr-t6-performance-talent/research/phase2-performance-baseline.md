# Phase 2 绩效评价基线审计

日期：2026-08-25。`HEAD=origin/main=a0244699a9a7a31e118ee0bff266e5d4c24673dd`；全远端最高迁移 `000257`，Phase 2 可用迁移号为 `000258`，生产 seed 为 `000024`。

## 当前实现缺口

- `HrService` 创建绩效周期时直接进入 `active`，没有模板、维度、等级、适用组织或来源版本冻结。
- 计划创建只复制目标名称和部分指标；没有冻结目标版本、考勤月结批次、奖惩链接版本、培训结果版本或已发布 360 版本。
- 状态实际为 `self_review -> manager_review -> calibrating -> confirmed`，缺 `planning`、规范 `calibration`、员工确认与申诉。
- 自评、经理评和校准直接覆盖 plan/item 分数字段，没有 append-only submission/action；校准直接把客户端总分写入 final score。
- 经理审核的范围检查、状态检查和写入不在同一事务/悲观锁中；并发请求可能重复成功。
- 校准没有 batch、参会范围、调整前后值和强制理由；员工确认前仍可能通过通用读取看到结果。
- Controller 权限仅有 read/manage/self_review/manager_review/calibrate，缺 team/self/result/acknowledge/appeal/template atoms。
- `/hr/performance` 使用通用 employee API，缺精确 options、stale abort、敏感状态清空、独立 403/error/retry。

## Phase 2 实施边界

- `000258` 只做前向扩展：模板/version/dimension/level、周期冻结快照、来源证据、submission/action、calibration batch/entry、appeal；不得修改 `000257`。
- 旧计划保留主键并标记兼容来源；为已有状态生成无伪造操作者的 baseline action，旧工资、考勤、员工、奖惩、培训和 360 表只读引用。
- 所有阶段动作锁 plan；服务端从冻结维度和追加提交重算总分/等级；数据库阻止非法跳转、终态修改和 evidence/action 更新删除。
- 新独立 Service/Controller 取代旧路由，Controller 使用精确权限，Service 直调固定 `park|managed_org_tree|self|none` 并执行 required audit/显式投影。
