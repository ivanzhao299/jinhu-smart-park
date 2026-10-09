# 设计
复用 POST cases/:id/corrections 的 MANAGE、approved 状态锁和既有幂等拦截。新 adapter 明确 type=correction，返回 id/sequenceNo。详情局部组件与父 mutate 共用同步锁，保存确认先关闭已提交表单，再刷新 detail 的授权 corrections；刷新失败显示独立警告并可重读，不重发写请求。仅展示原服务允许的 corrections 摘要，不显示 reason 或扩大 SELF/TEAM 权限。未知响应保留请求体和键；确定400/403/404/422允许修改后新键。已知保存后可新建下一次更正。原批准事实、制度及证据不修改。复用全局 DS 与现有卡片样式。
