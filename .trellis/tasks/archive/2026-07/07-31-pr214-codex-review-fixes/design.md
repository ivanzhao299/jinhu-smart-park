# Design: PR214 Codex Review P1 修复

## Root Causes

1. 列表过滤上下文被错误复用为新增实体初值，把 UI 可见性诉求写进了后端业务状态。
2. 附件投影归一化只返回表单字符串，丢失了“原值不可用”和“原值明确为空”的区别。
3. API 打卡服务把可选 `photo_file_ids` 的缺省值转换为空数组，破坏了 PATCH-like 可选字段语义。

## Design

- 超期页面只展示由后端 `recalculateOverdue` 维护的结果，不提供普通新增入口。
- 隐患通用表单不提交 `overdue_flag`；编辑未涉及该字段时由 API 保留现值。
- 附件投影归一化返回 `{ available, value }`。仅数组投影为 available；缺失、掩码或错误形态为 unavailable。
- Web 在 unavailable 时隐藏可编辑附件 ID 输入并省略请求字段。
- API 使用纯函数在请求字段缺省时复制既有附件；显式数组（包括空数组）保持调用方意图。

## Compatibility

- 不改变打卡路由或 DTO 字段名。
- 正常可见附件数组的现有提交行为不变。
- 显式空数组仍表示主动清空，并继续受点位最少照片数校验。
- 超期计算仍沿用现有后端重算与状态日志流程。

## Break-Loop Analysis

### 1. Root Cause Category

- **B / Cross-Layer Contract**：可选替换字段的“缺省保留”契约没有贯穿 Web 与 API。
- **D / Test Coverage Gap**：首轮测试只验证了归一化结果，没有验证重新提交的持久化效果。
- **E / Implicit Assumption**：把列表筛选状态视为可写业务状态，把空显示值视为用户主动清空。

### 2. Why The First Fix Failed

1. 首轮超期修复为了让新增记录留在当前列表，直接写入 `overdue_flag`，只修复了可见性表象，破坏了超期判定权威。
2. 首轮附件修复阻止了 `.join` 崩溃，但丢弃 availability 元数据，导致后续提交仍可能覆盖证据。

### 3. Prevention Mechanisms

| Priority | Mechanism | Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | 筛选上下文与实体生命周期字段分离 | DONE |
| P0 | Cross-layer contract | 缺省附件字段在 API 保留现值，显式数组才替换 | DONE |
| P0 | Test | Web 三态投影 + API 缺省/空数组回归 | DONE |
| P1 | Executable spec | 更新附件表单 7 段式规范和跨层检查清单 | DONE |

### 4. Systematic Expansion

- 同类风险存在于所有权限投影后的附件/关系 ID replacement payload。
- 后续审查必须从显示降级继续追踪到提交 payload 和服务持久化，不以“页面不崩溃”为终点。
