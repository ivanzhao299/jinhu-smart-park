# HCD 中文名称显示最终 UAT（2026-09-02）

## 结论

**BLOCKED，不归档。** PR1 #536、PR2 #537、PR3 #538 均已合入，PR 与 main 门禁为绿色；静态成熟门禁和 HCD 定向测试通过。真实浏览器在访问任何业务页面前连续两次无法建立 headless Chrome CDP，因此没有 27 路由桌面/390px 的有效页面证据，不将全栈初始化、登录页或组件测试冒充浏览器 UAT。

## 已完成交付

- PR1 #536：shared 封闭枚举、Web presentation 与 A/C 类接线，merge commit `422af8fa`。
- PR2 #537：四项授权名称投影、权限裁剪/null 回退与 picker 按 ID 恢复，merge commit `c9177120`。
- PR3 #538：六组 D 类临时定名、开放字典优先策略与收尾接线，merge commit `599fb765`。
- 三个 PR 的 required checks、合并后的 main CI 与自动部署均成功；未对生产执行直接操作。

## 成熟门禁

2026-09-02 在 `main@599fb765` 执行：

- `pnpm lint`：PASS。
- `pnpm typecheck`：PASS。
- `pnpm build`：PASS（191/191 静态页面生成）。
- `pnpm --filter @jinhu/shared test`：36/36 PASS。
- `pnpm --filter @jinhu/web test:unit:homestay`：18/18 PASS。
- `pnpm --filter @jinhu/web test:unit:housing`：33/33 PASS。
- `pnpm --filter @jinhu/web test:unit:property`：33/33 PASS。
- PR3 与 main Release Smoke：PASS；其 disposable PostgreSQL/API/文件卷门禁包含民宿与长租 Property API 聚合回归。

未运行 `pnpm test:unit:web`，因为该聚合命令包含 HR 测试，超出本任务硬边界；改为只运行本任务相关的三个 Web suite。

## 隔离全栈与浏览器阻塞

两次有效初始化均使用全新 disposable PostgreSQL、282/282 migration 与 8/8 prerequisite、production-safe seed、临时 bootstrap admin、独占 API/Web、独占文件目录与独立 Chrome profile。两轮均通过 strict baseline、API `/api/v1/ready` 与 Web `/login`。浏览器 runner 随后在任何业务路由访问前失败：

1. Windows Chrome 文件可见，但当前 WSL 会话禁用 Windows 互操作，随机 CDP 端口在 15 秒内不可达。
2. 改用本机已有缓存 Linux Chrome-for-Testing，随机 CDP 端口仍在 15 秒内不可达。

达到同一浏览器启动问题最多两次的限制后停止。每轮均执行 `docker compose down -v --remove-orphans`；本轮容器、volume、network 与临时凭据残留为零。未操作生产、HR、`phoenix-v3-db`、他人容器或主 Chrome。

因此以下项目仍无真实浏览器证据：27 路由桌面与精确 390px、详情与 picker 名称回显、权限裁剪下名称不泄漏及中文占位、未知值实际页面兜底、长中文不溢出/不挤压主操作、逐页 Network/console 零错误。代码/contract 测试覆盖不能替代这些视觉与交互断言。

## D 类临时定名（待产品确认）

- 民宿住客核验：未核验、已核验、已驳回；凭证：已发放、已回收、已遗失、已作废。
- 民宿审计动作：创建订单、确认订单、登记未到店、取消订单、订单改期、办理入住、办理退房；未知值为“未知订单操作”。
- Party：核验为未核验/已核验/已驳回；同意为待确认/已同意/已撤回；同意事实为待补证据/已取得同意/已撤回同意/不适用；来源为经操作员记录/历史来源未知。
- Party 角色/来源：`tenant` 为“租客”，`housing_lease` 为“长租租约”；其他未知值使用中文通用兜底。
- 住房费用：租金、押金、能耗费、退租结算费、退租扣款、采购补收；支付方式：银行转账、现金、微信、支付宝、POS、其他。租户 `/dict-items` 配置优先于平台临时名。
- Identity/通知/事件/retention：集中中文状态、事件与保留动作目录；retention 当前没有 Web 页面，未虚构页面验收。

## 解阻条件

在可执行专用 Chrome 且 CDP 可达的环境中，复用审计报告的 30 项矩阵与 27 路由清单，完成桌面/390px、具名详情 fixture、受限权限账号和未知/长中文 fixture；逐页保存 DOM、截图、Network 与 console 证据。全部通过后再更新本报告、归档 Trellis 任务并提交终报。
