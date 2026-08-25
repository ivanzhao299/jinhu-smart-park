# Phase 2-A 绩效配置与冻结切片实施证据

## 实施边界

- 新增 `000258` 前向迁移，旧 `000232` 的 cycle/plan/item 主键和业务字段不改写。
- 独立 `HrPerformanceReviewService`/Controller 提供模板创建发布、周期创建发布、范围查询和服务端计分预览。
- 本切片只冻结模板、适用组织、员工、目标和已确认来源版本；不实施主管评价、校准、签收或申诉写动作，不修改工资、考勤、奖惩、培训、360 或员工聚合。
- Web 使用精确 options 和 DS 工作台；员工/经理不会获得模板配置或全园区结果权限。

## 数据库门禁

- template0：官方 runner 249/249，prerequisite 8/8。
- replay：249/249 checksum matched。
- production seed：含 `000024` 连续两次成功。
- upgrade：在 `000257` 前置库写入旧 cycle/plan/item 后执行 `000258`，行数、关系和状态/最终分数 hash 守恒；旧 plan 为 `legacy_000232`。
- PostgreSQL：服务端 decimal 加权复算、发布配置 INSERT/UPDATE/DELETE 不可变、周期快照不可变、并发重复模板仅一次成功、员工/工资/考勤零副作用均通过。

## 代码门禁

- focused contract：4/4。
- API full：1495 total，1467 passed，28 environment skips，0 failed。
- Shared build、API/Web lint、typecheck、production build、CSS architecture、diff-check 全部通过。

## Phase 2-B 保留项

- 冻结维度上的自评、主管评、校准批次、员工签收和申诉追加动作。
- 确认前结果字段隐藏、最终等级落库与可复算证明。
- 三角色真实浏览器桌面/390px UAT 和正式发布门禁。

## 独立 Trellis Check 修订

- 补齐模板根、模板版本、周期、周期员工和证据的双向冻结；发布后新员工/证据写入、快照反向修改、周期删除及非法状态跳转均由 PostgreSQL 阻断。
- 周期员工增加 tenant/park scoped 员工外键和完整非 partial 子索引；目标冻结改为精确 `hr_goal_version` 版本快照。
- 模板发布在数据库内复核维度权重与 0.00–100.00 连续等级边界；计分与等级匹配全部使用 PostgreSQL numeric，不以 JavaScript 浮点决定等级。
- team/self 周期投影只统计当前可见员工，不返回全周期人数；Web 请求使用真实 `AbortController` 中止过期读取。
- 修订后重新通过 template0 249/249、prerequisite 8/8、seed 双跑、249/249 replay；独立 000257 升级夹具的 cycle/plan/item 计数、主键关系和业务字段 hash 守恒，旧 final score `88.50` 与 `legacy_000232` 标记保持不变。
- 真实 PostgreSQL 已证明 decimal 复算、发布后 INSERT/UPDATE/DELETE 反向封锁及员工/工资/考勤/工资条零副作用；API full 为 1495 total / 1467 pass / 28 environment skip / 0 fail。
