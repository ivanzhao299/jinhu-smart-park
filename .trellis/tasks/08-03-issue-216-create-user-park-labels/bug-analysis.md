## Bug Analysis: 新增用户园区显示为纯数字串

### 1. Root Cause Category

- **Category**: E - Implicit Assumption
- **Specific Cause**: 用户表单假设 `parkName` 永远是可读业务名称，并无条件把它与内部 `parkId` 拼接；租户创建边界又允许纯数字初始园区名称，导致历史异常名称与数字 ID 组合后完全失去业务可读性。

### 2. Why Earlier Fix Was Incomplete

1. 先前修复只解决新增用户园区候选项加载与选择，没有验证候选项的用户可见标签。
2. 回归测试只锁定园区 ID 选择和租户切换，没有覆盖正常/异常展示名称。

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|----------|-----------|-----------------|--------|
| P0 | Architecture | 默认园区与可访问园区统一调用纯函数解析业务标签 | DONE |
| P0 | Runtime | Web/API 拒绝纯数字或空白的初始园区名称 | DONE |
| P0 | Test Coverage | 覆盖历史异常兜底、内部 ID 隐藏、DTO 正反例及两个控件使用点 | DONE |
| P1 | Documentation | 在 Web/API Trellis 规范记录目录标签与业务名称输入约束 | DONE |

Codex 复审进一步暴露两种同一契约的边界绕过：DTO 的 optional 允许完全省略名称，Web 的纯数字判断允许数字间空白。当前契约统一为“必填且至少包含一个非数字、非空白字符”，测试同时锁定省略与 `11 12`。

第二轮复审继续暴露 ASCII 中心假设与标签唯一性假设：`\\d` 不包含全角、阿拉伯等 Unicode 数字，园区名称本身也没有唯一约束。契约改为 Unicode number 分类；可见标签按候选集合检测碰撞，仅冲突项追加唯一业务编码。

第三轮复审暴露了消歧只检查基础标签的隐含假设：追加业务编码生成的新标签仍可能与另一个真实名称相同。当前实现迭代检查最终展示值，直到候选集合全局唯一；回归测试构造真实名称等于首轮消歧结果的链式碰撞。

### 4. Systematic Expansion

- **Similar Issues**: 其他目录选择器若直接显示 `name / id`，也可能暴露内部 ID 或放大历史脏名称，应在后续修改时遵循同一规范。
- **Design Improvement**: 将标识符限定在 value/key，把用户可见标签作为独立投影处理。
- **Process Improvement**: 目录加载类修复的回归必须同时检查候选集合、选择值和可见标签。

### 5. Knowledge Capture

- [x] 更新 Web frontend spec：目录选择器不暴露内部 ID，异常名称使用单一业务兜底。
- [x] 更新 API backend spec：业务展示名称在规范化后必须包含非数字字符。
- [x] 新增 Web 标签与 API DTO 防复发测试。
