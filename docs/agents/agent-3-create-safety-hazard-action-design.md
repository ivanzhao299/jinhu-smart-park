# 设计文档：CREATE_SAFETY_HAZARD 动作真实执行

> 状态：DESIGN（待实施）
> 分支：agent-3-ops-iot-safety
> 日期：2026-06-21
> 作者：Agent 3

---

## 一、目标

将 `UnifiedActionExecutorService` 中的 `CREATE_SAFETY_HAZARD` 动作从 `SIMULATED`（模拟）改为真实创建安全隐患，打通 IoT 规则引擎 → 安全隐患的自动化链路。

**期望效果**：当 IoT 规则/场景配置 `CREATE_SAFETY_HAZARD` 动作时，系统自动在 `biz_safety_hazard` 中创建一条真实隐患记录，状态为 `10`（已登记），来源标记为系统告警，并具备幂等保护。

**不在本次范围内**：
- `CREATE_INSPECTION_TASK` 真实化
- `CREATE_ENERGY_ALERT` / `CREATE_VIDEO_ALERT` 真实化
- 设备控制类动作（`CONTROL_DEVICE` 等）真实化

---

## 二、推荐方案

### 核心决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| `source_type` 值 | `"alert"` | 字典 `safety_hazard_source_type` 中已有 `alert`（系统告警），无需新增 migration |
| 幂等去重入口 | `SafetyHazardsService.findBySource()` | 逻辑封装在服务层，不在执行器中散落 Repository 查询 |
| 隐患创建入口 | `SafetyHazardsService.create()` | 复用现有字典校验、位置解析、编号生成、事务写入、操作日志 |
| 执行 actor | `systemActor(scope, source_type)` | `isSuper=true` 可绕过 DataScope 过滤（已确认 `data-scope.service.ts:147,159,214,236`），与 `CREATE_WORK_ORDER` 实现一致 |
| 模块注入 | 将 `SafetyHazardsModule` 加入 `IotModule.imports` | `SafetyHazardsModule` 已 `exports: [SafetyHazardsService]`；无循环依赖 |
| 错误处理 | 让异常冒泡到外层 `try/catch`，返回 `FAILED` | 与 `executeAction` 现有 catch 风格（`line 97-100`）完全一致 |

### 依赖链路图

```
IoT 规则/场景触发
        │
        ▼
UnifiedActionExecutorService.executeAction(input, actor)
        │  action_type = "CREATE_SAFETY_HAZARD"
        ▼
[幂等检查] SafetyHazardsService.findBySource(scope, "alert", source_id)
        │  若已存在 → 返回 SUCCESS + existing hazard_id（跳过创建）
        │  若不存在 ↓
        ▼
SafetyHazardsService.create(scope, systemActor, dto)
        │  内部：字典校验 → 位置解析 → 编号生成 → 事务写入
        │         → biz_safety_hazard
        │         → biz_safety_hazard_status_log
        │         → biz_safety_action_log
        ▼
返回 UnifiedActionExecutionResult { execution_status: "SUCCESS", result_payload: { hazard_id, hazard_code, status, idempotent } }
```

---

## 三、需要改动的文件

### 3.1 必须改动（核心实现）

| 文件 | 改动类型 | 说明 |
|---|---|---|
| `apps/api/src/modules/iot/iot.module.ts` | 修改 | imports 中添加 `SafetyHazardsModule` |
| `apps/api/src/modules/iot/unified-action-executor.service.ts` | 修改 | 注入 `SafetyHazardsService`；从 `SIMULATED_ACTION_TYPES` 移除 `CREATE_SAFETY_HAZARD`；添加 `createSafetyHazard()` 私有方法 |
| `apps/api/src/modules/safety-hazards/safety-hazards.service.ts` | 修改 | 新增 `findBySource(scope, sourceType, sourceId)` 方法 |

### 3.2 不需要改动

| 文件 | 原因 |
|---|---|
| `unified-action-executor.types.ts` | `CREATE_SAFETY_HAZARD` 已在 `UNIFIED_ACTION_TYPES` 中，无需改 |
| `safety-hazards.module.ts` | 已 `exports: [SafetyHazardsService]`，无需改 |
| `CreateSafetyHazardDto` | 现有字段已完全满足需求，无需改 |
| `SafetyHazardEntity` | 已有 `source_type`、`source_id`、位置字段，无需改 |
| 任何 migration | 字典 `safety_hazard_source_type` 已有 `"alert"` 值，无需新增 |
| 任何 seed | 无需改 |
| e2e 脚本（s5a / s9c / s9d1） | 见第八节；现有脚本不需要修改即可继续通过 |

---

## 四、幂等策略

### 4.1 有 `source_id` 的情况（主路径）

当 `input.source_id` 非空（UUID 格式）时：

```
查询条件：
  tenant_id = scope.tenantId
  park_id   = scope.parkId
  source_type = "alert"
  source_id   = input.source_id
  is_deleted  = false
```

- 若查到已有隐患 → 直接返回 `SUCCESS`，`result_payload` 包含 `{ hazard_id, hazard_code, idempotent: true }`，跳过创建。
- 若未查到 → 执行 `SafetyHazardsService.create()`。

**实现位置**：`SafetyHazardsService.findBySource(scope, sourceType, sourceId)` 返回 `SafetyHazardEntity | null`。

### 4.2 无 `source_id` 的情况（降级路径）

当 `input.source_id` 为 null/undefined（例如 MANUAL 类型场景触发）时：

- **允许创建**，但 `result_payload` 标记 `{ idempotent: false, no_source_id: true }`，表示本次创建无幂等保证。
- 调用方（场景执行日志）会记录此状态，运营人员可人工核查重复。
- **不阻断执行**：此为低频边缘路径（MANUAL 触发时用户本身也是有意操作）。

### 4.3 幂等检查时序

```
执行 findBySource
    ↓ 存在？
   YES → 返回 { execution_status: SUCCESS, idempotent: true, hazard_id }
    NO ↓
执行 create
    ↓ 成功？
   YES → 返回 { execution_status: SUCCESS, idempotent: false, hazard_id }
    NO → 异常冒泡 → 外层 catch → FAILED
```

> 注意：不使用数据库唯一约束来做幂等（`biz_safety_hazard` 的唯一约束是 `hazard_code`，不是 `source_id`）。由 `findBySource` 应用层检查保证。并发场景下极低概率重复创建可接受（系统自动化隐患，运营人员可合并处理）。

---

## 五、字段映射策略

### 5.1 优先级规则

每个字段按以下优先级解析（高→低）：
1. `action_payload`（用户在规则/场景中配置）
2. `context_payload`（触发时的设备/告警上下文）
3. 默认值（安全降级，见第六节）

### 5.2 完整映射表

| CreateSafetyHazardDto 字段 | action_payload 键 | context_payload 键 | 默认值 / 生成规则 |
|---|---|---|---|
| `title` | `title` | `rule_name`（拼接） | `"${sourceName} 触发安全隐患"` |
| `hazard_type` | `hazard_type` | — | `"other"` |
| `risk_level` | `risk_level` | — | `"10"`（一般） |
| `description` | `description` | — | `"由 ${sourceName} (${source_id}) 自动生成"` |
| `location` | `location` | `device_code` / `building_id` 拼接 | `"待补充"` |
| `source_type` | — | — | 固定 `"alert"` |
| `source_id` | — | — | `input.source_id ?? undefined` |
| `building_id` | `building_id` | `building_id` | `undefined` |
| `floor_id` | `floor_id` | `floor_id` | `undefined` |
| `unit_id` | `unit_id` | `unit_id` | `undefined` |
| `park_tenant_id` | `park_tenant_id` | `park_tenant_id` | `undefined` |
| `rectify_deadline` | `rectify_deadline` | — | `undefined`（见第六节风险） |
| `rectify_user_id` | `rectify_user_id` | — | `undefined` |
| `before_photo_file_ids` | — | — | 不设置（系统创建无现场照片） |

### 5.3 location 生成规则

```
优先级：
1. action_payload.location（用户显式配置）
2. context_payload.location（告警传递的位置描述）
3. 从 context_payload 拼接："设备 ${device_code}" + 如有 building_id/floor_id 则附加 "(楼栋/楼层待关联)"
4. 最终兜底："待补充"
```

---

## 六、默认值策略

### 6.1 `hazard_type` 默认 `"other"`

- 字典中 `other` 始终存在，字典校验必然通过。
- 运营人员可在隐患创建后手动修改类型。

### 6.2 `risk_level` 默认 `"10"`（一般）

- 字典有效值：`10`（一般）/ `20`（较大）/ `30`（重大）。
- **不允许默认为 `30`**：`risk_level="30"` 时 `assertMajorDeadline` 要求 `rectify_deadline` 非空，否则抛 400，导致 `FAILED`。

### 6.3 `risk_level="30"` 的处理策略（重要）

`SafetyHazardsService.create` 中 `assertMajorDeadline` 逻辑（`safety-hazards.service.ts:1026-1029`）：

```typescript
if (["major", "30", "critical", "40"].includes(riskLevel) && !deadline) {
  throw new BadRequestException("rectify_deadline is required for major hazard");
}
```

**策略：允许用户在 action_payload 中配置 `risk_level="30"`，但必须同时配置 `rectify_deadline`。若缺少 `rectify_deadline`，执行器返回 `FAILED` 并在 `error_message` 中说明原因。**

实现时不做静默降级（不自动把 `30` 改成 `10`）：
- 保留用户意图，FAILED 状态明确提示配置问题，而非静默修改业务语义。
- 运营人员看到 FAILED 日志，可修正规则配置后重试。

### 6.4 `title` / `description` 自动生成

```typescript
const sourceName = this.sourceName(input.source_type);  // 已有方法
const title = readString(action, "title")
  ?? `${sourceName} 触发安全隐患`;
const description = readString(action, "description")
  ?? `由 ${sourceName} 规则（${input.source_id ?? "无编号"}）自动生成，请核实隐患情况并补充信息。`;
```

---

## 七、错误处理策略

### 7.1 遵循现有执行器风格

`executeAction` 外层 catch（`unified-action-executor.service.ts:97-101`）：

```typescript
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  this.logger.warn(`Unified action ${actionType} failed: ${message}`);
  return this.result(actionType, "FAILED", {}, message, executedAt);
}
```

**`createSafetyHazard` 私有方法不需要内部 try/catch**，直接 `throw` 让外层统一处理。

### 7.2 各错误场景

| 错误场景 | 触发原因 | 执行器返回 | 日志 |
|---|---|---|---|
| 字典校验失败 | `hazard_type`/`risk_level`/`source_type` 不在字典中 | `FAILED` + `error_message: "${dictCode} value is invalid"` | `logger.warn` |
| 缺少 `rectify_deadline`（risk_level=30） | 用户配置 30 但未提供截止日期 | `FAILED` + `error_message: "rectify_deadline is required for major hazard"` | `logger.warn` |
| 编号生成失败 | `CodeRulesService.generateNext` 异常 | `FAILED` + 原始 error message | `logger.warn` |
| DB 写入失败 | 事务异常、连接超时等 | `FAILED` + 原始 error message | `logger.warn` |
| 幂等去重找到已有记录 | `findBySource` 返回非 null | `SUCCESS` + `{ idempotent: true, hazard_id, hazard_code }` | 无（正常路径） |
| `source_id` 缺失 | MANUAL 触发，无 source_id | `SUCCESS` + `{ idempotent: false, no_source_id: true, hazard_id }` | 无（正常路径） |

### 7.3 NOT 改变的现有行为

- `FAILED` 状态下场景执行日志 `execution_status` 会被 `resolveAggregateStatus` 计入，可能导致场景整体 `FAILED` 或 `PARTIAL_SUCCESS`。这是现有机制，不修改。
- `SafetyHazardsService.create` 内部使用 `DataSource.transaction`，由执行器外部调用，不存在嵌套事务风险。

---

## 八、回归影响

### 8.1 `pnpm run test:e2e:s5a-safety`

**无影响。**

- s5a 通过 HTTP POST `/safety/hazards` 或 SQL 直接插入创建隐患，不经过 `UnifiedActionExecutorService`。
- s5a 唯一涉及 `source_type` 的断言（`AND source_type = 'inspection'`，第 775 行）与 `"alert"` 完全独立。
- `SafetyHazardsService.create` 调用路径未变化，新增的 `findBySource` 方法不影响现有方法。

### 8.2 `pnpm run test:e2e:s9c-iot-rule-engine`

**无影响（已通过 grep 确认）。**

- s9c 中 **不含** `CREATE_SAFETY_HAZARD` 类型规则。
- s9c 断言围绕规则执行日志的 JSON 结构（`execution_status` 字段存在），不断言具体动作类型的返回值。

### 8.3 `pnpm run test:e2e:s9d1-unified-action-executor`

**无影响。**

- s9d1 所有规则和场景全部使用 `NOOP_SIMULATION`，无 `CREATE_SAFETY_HAZARD`。
- s9d1 断言 `execution_status === "SUCCESS"`，`NOOP_SIMULATION` 走独立分支（`actionType === "NOOP_SIMULATION" ? "SUCCESS" : "SIMULATED"`），与 `CREATE_SAFETY_HAZARD` 分支解耦。
- `SIMULATED_ACTION_TYPES` 集合移除 `CREATE_SAFETY_HAZARD` 后，`NOOP_SIMULATION` 仍在集合中，s9d1 断言不受影响。

---

## 九、建议新增或调整的测试

### 9.1 是否需要修改 s9d1

**推荐**在 s9d1 中新增一个 `CREATE_SAFETY_HAZARD` 的烟雾测试用例，以验证：
1. 首次触发 → 返回 `execution_status: "SUCCESS"`，`idempotent: false`。
2. 相同 `source_id` 再次触发 → 返回 `execution_status: "SUCCESS"`，`idempotent: true`。
3. `hazard_type` 为无效字典值 → 返回 `execution_status: "FAILED"`。

### 9.2 必要 fixture

```javascript
// s9d1 新增段落示意（供实施时参考，非本轮编写）

// 1. 创建一条测试隐患规则（有效配置）
const hazardRule = await createRule(token, {
  name: `S9D1 hazard rule ${stamp}`,
  actions: [{
    type: "CREATE_SAFETY_HAZARD",
    hazard_type: "other",
    risk_level: "10",
    title: `S9D1 IoT 触发隐患 ${stamp}`,
    description: "s9d1 smoke test auto hazard",
    location: "s9d1 测试位置"
  }]
});

// 2. 触发规则 → 验证 SUCCESS + hazard_id
const tested = await jsonRequest(`/iot/rules/${hazardRule.id}/test`, token, "POST",
  { trigger_payload: { device_id: device.id, source: "s9d1" } },
  "test-hazard-rule"
);
assertStatus("hazard rule test", tested.response.status, 201);
const hazardResult = tested.body.data?.actionResult?.[0];
assert(hazardResult?.execution_status === "SUCCESS", "CREATE_SAFETY_HAZARD should return SUCCESS");
assert(hazardResult?.result_payload?.hazard_id, "result_payload must include hazard_id");
assert(!hazardResult?.result_payload?.idempotent, "first creation: idempotent=false");

// 3. 再次触发（相同 source_id = rule.id）→ 验证 idempotent=true
const retested = await jsonRequest(`/iot/rules/${hazardRule.id}/test`, token, "POST",
  { trigger_payload: { device_id: device.id, source: "s9d1" } },
  "retest-hazard-rule"
);
const hazardResult2 = retested.body.data?.actionResult?.[0];
assert(hazardResult2?.execution_status === "SUCCESS", "idempotent call should still be SUCCESS");
assert(hazardResult2?.result_payload?.idempotent === true, "second call: idempotent=true");
assert(hazardResult2?.result_payload?.hazard_id === hazardResult.result_payload.hazard_id,
  "same hazard_id returned on idempotent call");

// 4. DB 验证：仅存在 1 条隐患记录
const hazardCount = Number(await psql(`
  SELECT COUNT(*) FROM biz_safety_hazard
  WHERE source_type = 'alert'
    AND source_id = '${hazardRule.id}'
    AND is_deleted = false;
`));
assert(hazardCount === 1, "idempotent: only 1 hazard should exist");
```

### 9.3 清理要求

s9d1 已有 smoke cleanup 机制（`pnpm smoke:cleanup`），测试隐患记录会被软删除清理。确认 `biz_safety_hazard` 表的 `is_deleted` 软删除已在 cleanup 脚本覆盖范围内（或在 s9d1 末尾补充显式 cleanup SQL）。

---

## 十、最终实施步骤（Checklist）

下一轮真正开发时，按序执行：

### 10.1 准备阶段

- [ ] 运行 `pnpm typecheck` 确认当前 baseline 干净
- [ ] 运行 `pnpm run test:e2e:s5a-safety` 确认 baseline 通过
- [ ] 运行 `pnpm run test:e2e:s9d1-unified-action-executor` 确认 baseline 通过

### 10.2 实施：SafetyHazardsService 新增 findBySource

**文件**：`apps/api/src/modules/safety-hazards/safety-hazards.service.ts`

- [ ] 在 `SafetyHazardsService` 末尾新增方法：
  ```typescript
  async findBySource(
    scope: TenantParkScope,
    sourceType: string,
    sourceId: string
  ): Promise<SafetyHazardEntity | null> {
    return this.hazardsRepository.findOne({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        sourceType,
        sourceId,
        isDeleted: false
      }
    });
  }
  ```
- [ ] 该方法不需要 DataScope 过滤（内部调用，scope 已明确）
- [ ] `hazardsRepository` 已通过 `@InjectRepository(SafetyHazardEntity)` 注入，无需额外 Repository

### 10.3 实施：iot.module.ts 添加 SafetyHazardsModule

**文件**：`apps/api/src/modules/iot/iot.module.ts`

- [ ] 在 imports 数组末尾添加 `SafetyHazardsModule`
- [ ] 在顶部 import `SafetyHazardsModule`
- [ ] **不需要** 在 `TypeOrmModule.forFeature` 中添加 `SafetyHazardEntity`（通过 SafetyHazardsModule 间接提供）

### 10.4 实施：unified-action-executor.service.ts 核心改动

**文件**：`apps/api/src/modules/iot/unified-action-executor.service.ts`

- [ ] 顶部新增 import：
  ```typescript
  import { SafetyHazardsService } from "../safety-hazards/safety-hazards.service";
  import type { SafetyHazardEntity } from "../safety-inspect-tasks/entities/safety-hazard.entity";
  ```
- [ ] 构造函数末尾注入：
  ```typescript
  private readonly safetyHazardsService: SafetyHazardsService
  ```
- [ ] `SIMULATED_ACTION_TYPES` 集合中**移除** `"CREATE_SAFETY_HAZARD"`（保留其他所有 SIMULATED 类型）
- [ ] 在 `if (actionType === "CREATE_WORK_ORDER")` 块之后，`if (this.isDeviceControlAction(actionType))` 之前，插入：
  ```typescript
  if (actionType === "CREATE_SAFETY_HAZARD") {
    const hazard = await this.createSafetyHazard(input, actionPayload, contextPayload, actor);
    return this.result(actionType, "SUCCESS", {
      hazard_id: hazard.entity.id,
      hazard_code: hazard.entity.hazardCode,
      status: hazard.entity.status,
      idempotent: hazard.idempotent,
      ...(hazard.noSourceId ? { no_source_id: true } : {})
    }, null, executedAt);
  }
  ```
- [ ] 新增私有方法 `createSafetyHazard()` —— 见 §10.5
- [ ] 运行 `pnpm typecheck` 验证类型无误

### 10.5 createSafetyHazard 私有方法规格

```typescript
private async createSafetyHazard(
  input: UnifiedActionExecutionInput,
  action: Record<string, unknown>,
  context: Record<string, unknown>,
  actor?: JwtPrincipal
): Promise<{ entity: SafetyHazardEntity; idempotent: boolean; noSourceId: boolean }> {
  const scope = this.scope(input);
  const sourceId = input.source_id ?? null;

  // 幂等检查（仅当 source_id 存在时）
  if (sourceId) {
    const existing = await this.safetyHazardsService.findBySource(scope, "alert", sourceId);
    if (existing) {
      return { entity: existing, idempotent: true, noSourceId: false };
    }
  }

  const principal = actor ?? this.systemActor(scope, input.source_type);
  const sourceName = this.sourceName(input.source_type);
  const hazardType = this.readString(action, "hazard_type") ?? "other";
  const riskLevel = this.readString(action, "risk_level") ?? "10";
  const title = this.readString(action, "title") ?? `${sourceName} 触发安全隐患`;
  const description = this.readString(action, "description")
    ?? `由 ${sourceName} 规则（${sourceId ?? "无编号"}）自动生成，请核实隐患情况并补充信息。`;
  const location =
    this.readString(action, "location") ??
    this.readString(context, "location") ??
    (this.readString(context, "device_code")
      ? `设备 ${this.readString(context, "device_code")}`
      : "待补充");

  const entity = await this.safetyHazardsService.create(scope, principal, {
    title,
    hazard_type: hazardType,
    risk_level: riskLevel,
    description,
    location,
    source_type: "alert",
    source_id: sourceId ?? undefined,
    building_id: this.readString(action, "building_id") ?? this.readString(context, "building_id"),
    floor_id: this.readString(action, "floor_id") ?? this.readString(context, "floor_id"),
    unit_id: this.readString(action, "unit_id") ?? this.readString(context, "unit_id"),
    park_tenant_id: this.readString(action, "park_tenant_id") ?? this.readString(context, "park_tenant_id"),
    rectify_deadline: this.readString(action, "rectify_deadline"),
  });

  return { entity, idempotent: false, noSourceId: !sourceId };
}
```

### 10.6 验证阶段

- [ ] `pnpm typecheck`（必须 0 错误）
- [ ] `pnpm lint`
- [ ] `pnpm run test:e2e:s5a-safety`（安全闭环回归，必须通过）
- [ ] `pnpm run test:e2e:s9c-iot-rule-engine`（规则引擎回归）
- [ ] `pnpm run test:e2e:s9d1-unified-action-executor`（统一动作执行器回归）
- [ ] 手动验证：通过 IoT 规则配置 `CREATE_SAFETY_HAZARD`，触发后确认 `biz_safety_hazard` 中存在 `source_type="alert"` 的隐患记录

### 10.7 可选：s9d1 测试增强

- [ ] 若评审通过，在 s9d1 中追加 §9.2 示意的 fixture 段落（需同步更新 cleanup 逻辑）
- [ ] 更新 `scripts/e2e/s9d1-unified-action-executor-smoke.mjs`，追加 `CREATE_SAFETY_HAZARD` 正常路径 + 幂等路径 + 无效字典值路径三个断言

### 10.8 文档与 Commit

- [ ] 提交 commit（仅代码，不包含本设计文档）：
  ```
  feat(iot): implement CREATE_SAFETY_HAZARD unified action as real hazard creation

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```

---

## 附录 A：循环依赖验证

```
IotModule → SafetyHazardsModule  ← 新增
SafetyHazardsModule → WorkOrdersModule  ← 已有
WorkOrdersModule → (无 IotModule 导入)  ✅
SafetyHazardsModule → (无 IotModule 导入)  ✅
```

**结论**：无循环依赖，`forwardRef` 不需要。

---

## 附录 B：现有字典 `safety_hazard_source_type` 值（已全部落库）

| item_value | 标签 | 来源 migration |
|---|---|---|
| `manual` | 人工登记 | 000086 |
| `inspection` | 巡检发现 | 000086 |
| `workorder` | 工单转入 | 000092 |
| `complaint` | 投诉 | 000092 |
| `alert` | 系统告警 | 000086 ← **本次使用** |
| `robot` | 机器人发现 | 000092 |
| `system` | 系统生成 | 000086 |
| `video` | 视频发现 | 000126 |

---

## 附录 C：systemActor 特性说明

```typescript
// unified-action-executor.service.ts:361-372
private systemActor(scope: TenantParkScope, sourceType: string): JwtPrincipal {
  return {
    sub: "00000000-0000-0000-0000-000000000000",
    username: "unified_action_executor",
    realName: `统一动作执行器(${sourceType})`,
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    roles: [],
    permissions: [],
    isSuper: true  // ← 绕过 DataScopeService 全部过滤
  };
}
```

`DataScopeService` 确认（`data-scope.service.ts:147,159,214,236`）：
- `isSuper=true` 跳过 DataScope 过滤
- `SafetyHazardsService.create` 中的 `applyDataScope` 对 systemActor 无效（正确行为，系统创建不受数据权限约束）

---

*本文档由 Agent 3 生成，作为实施阶段的唯一设计参考。实施时以本文档第十节 checklist 为准，不可跳过验证步骤。*
