# 设计

GET reconciliations/:id/review-actions 复用差异详情现有读取权限与requireReconciliationRead，新增有界page/page_size DTO。先校验当前scope/run，分页query+count采用同一一致性事务，sequence_no排序（稳定id辅助）；最小投影id/sequenceNo/decision/comment/createdAt/target/resultId/itemDifferenceId和员工/工资项目标签，操作者仅显示现有可用业务姓名，无法安全关联则不加入而不猜人。必需元数据读取审计同manager。

现有POST保留，沿用000250目标互斥约束：同时传resultId/itemDifferenceId显式BadRequest，item-only解析所属run及未软删parent；补已软删目标拒绝；不得新增自动批次接受或清算，逐项意见只是追加复核证据，不冒充更新整体差异状态。无需迁移。

Web API类型、paged adapter及组件复用原客户端差异块。提取独立ReviewWorkspace（以run+auth上下文key隔离）管理受控draft、目标、submit lock、原key和独立历史读取；父列表真实状态标签，成功后刷新父详情/列表要和写回执分离。权限变化和状态变化必须重新验证。不要将result.reviewStatus当作已执行追加意见的计算结论。

默认读取20，最高100，支持多页。未知status/decision明确不可用；评论作为普通文本呈现。保持现有桌面only复核CSS边界。回退应用版本，不删除意见历史。
