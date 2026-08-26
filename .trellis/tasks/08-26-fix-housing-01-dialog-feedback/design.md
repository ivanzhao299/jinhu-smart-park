# Technical Design

为 `ConsequenceDialog` 增加可选 error message，并在 modal form 内渲染 `role="alert" aria-live="assertive"`。`OperationWriteControls` 传入 feedback；请求失败时设置消息并返回 `false`，利用既有 `confirmationShouldClose(false)` 保持弹窗打开。成功路径不变。

不修改 API、状态码、幂等键或全局错误处理。
