# HOU-UAT-01：经营模式切换弹窗错误反馈

## Goal

修复 Issue #402：经营模式切换提交返回 409 时，在仍打开的原生对话框内提供可见且可访问的错误反馈。

## Requirements

- 保留服务端错误消息，不把所有 409 重写成模糊文案。
- 失败后对话框保持打开，原因输入与同 payload 幂等重试语义保持不变。
- 错误节点位于 dialog DOM 内，并使用 alert live-region 语义。
- 通用 ConsequenceDialog 的其他调用方在未传错误时行为不变。

## Acceptance criteria

- [ ] operation mode transition catch 不产生未处理 rejection。
- [ ] 409 消息在 dialog 内以 `role="alert"` 可见。
- [ ] 对话框失败不关闭，成功路径仍关闭并刷新。
- [ ] Web targeted tests、lint、typecheck、build 通过。
- [ ] PR CI、合并后 main CI/Deploy 双绿。
- [ ] 统一住房修复复测中真实 Chrome 回归通过。
