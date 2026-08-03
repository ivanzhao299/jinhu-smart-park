# Implementation Plan

- [x] 在 `user-park-options.logic.ts` 增加可测试的园区展示名解析函数。
- [x] 默认园区与可访问园区控件统一使用解析函数。
- [x] 扩展 `user-park-options.logic.spec.ts`，覆盖历史异常数据和两个使用点。
- [x] 将内部 ID 不作为用户可见标签的约束记录到 Web Trellis 规范。
- [x] 在租户创建 Web/API 边界拒绝纯数字或空白初始园区名称，并补 DTO 测试。
- [x] 运行相关单测、Web/API lint、typecheck、build 和 `git diff --check`。
- [x] 提交、推送、创建 PR，关联 Issue #216 并请求 Codex review。
- [x] 处理 Codex P1/P2：API 禁止省略园区名称，Web 兜底覆盖数字加空白历史名称。
- [x] 处理 Codex P2：统一识别 Unicode 数字，并为碰撞标签追加园区编码。
- [x] 处理 Codex P2：迭代检测追加编码后的最终标签，消除二次碰撞。
- [x] 处理 Codex P2：要求 Unicode 可读文字并在碰撞检测前规范化可折叠空白。
- [x] 处理 Codex P2：可逆转义园区编码空白，并在每轮碰撞检测前规范化完整标签。
- [x] 处理 Codex P2：以 NFC 比较业务标签，并以 ASCII-safe 形式可逆表示园区编码。
- [x] 处理 Codex P2：移除标签中的 Unicode Format 字符，消除零宽视觉碰撞。
- [x] 处理 Codex P2：扩展至 Unicode 默认不可见字符，并按提交用 `parkId` 去重候选。
