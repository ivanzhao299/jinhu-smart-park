# 执行设计
普通API调用者，独立于浏览器会话；服务端内核仍是唯一业务writer。CLI需要 --mode、--credentials、--receipt，preview额外明确 --batch-id/--index/--expected-file-sha256/--expected-count；commit/status从原回执恢复而不换目标。默认catalog绝不commit，禁用自动遍历提交。配置仅 apiBase/username/password/tenantId/parkId；生产scope固定当前Jinhu，用户选定已有账号。回执0700父目录/0600 regular独占文件、原子写、单writer防并发，安全输出均从白名单重建。持久化所有mutation intent/key先于网络请求，任何未知结果保留原绑定。响应使用严格code0/data封装，显式HTTP deadline/无redirect，无cookie/token持久化。

catalog file hash与operation canonical hash分开；无法从metadata计算服务端canonical hash。preview捕获后二次query以同ID/hash/count核对。若原预览失联，目录同包的operationId可用于恢复，未出现则明确同previewKey重试。commit对无法恢复结果保持uncertain。

服务端范围补充：仅在现有 previewed 操作的相同包锁与行锁下重建计划，无新增账本/业务写入，终态原结果不变。新增真实 PG 回归。显式计划刷新键与原 preview/commit 键分别保留。
