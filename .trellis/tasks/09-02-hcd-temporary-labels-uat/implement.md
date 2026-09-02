# Implementation Progress

## Dependency

PR2 合入 main 双绿后，从最新 `origin/main` 创建 `codex/fix-hcd-temporary-labels-uat`。

- [x] 盘点值域/dict code 并确定行业惯例临时中文。
- [x] shared 常量、注释、测试与 Web 接线。
- [ ] 27 路由桌面/390px 与主链 UAT（重启轮 22 个路由均仅 surface-only；raw-CDP runner 绕过 UI 登录且缺少逐项 DOM/交互、全量 Network、设备能力、反串线与 residual gate 证据，未记任何浏览器 HCD PASS；行级 HCD、住房 5 个具名详情、picker、窄权限、未知值与两条主链仍阻塞）。
- [x] 成熟基建、trellis-check、PR3、CI、merge、main 双绿。
- [ ] 归档并终报。

## Validation Log

- PR2 #537 已 squash merge 至 `main@c9177120`；main CI 与自动部署均 success。
- 三路只读盘点完成 HCD-005/007、015/028、026/030 的生产者、消费者和值域证据。
- D 类临时定名集中于 shared，并标注“临时定名待产品确认”；retention 仅入目录，未虚构 Web 页面。
- 开放住房费用/支付加载 `housing_charge_type` / `housing_payment_method` 的 enabled `/dict-items`；失败/无配置退回平台临时中文，表单提交仍为原始值。
- PASS shared build + 36/36；Web property 33/33、housing 33/33、homestay 18/18；Web typecheck；Web/shared lint；`git diff --check`。
- 首轮复核修复审批/运行时旁路的 raw action/status/source、Identity 证件类型/终态选项与机器错误码。
- 第二轮最终复核无 P0/P1；修复唯一 P2：运行时审批原因 `aria-label` 改用中文审批动作，并补静态回归断言。
- PR3 #538 squash merge 至 `main@599fb765`；PR checks、main CI 与自动部署均 success。
- 最终静态成熟门禁 PASS：全仓 `pnpm lint`、`pnpm typecheck`、`pnpm build`；shared 36/36，Web homestay 18/18、housing 33/33、property 33/33。
- 隔离全栈两轮均完成 282/282 migration 与 8/8 prerequisite、production-safe seed、bootstrap admin、strict baseline、API `/ready` 与 Web `/login`；每轮结束均销毁本轮容器、volume、network 与临时凭据，未触碰生产、HR、他人容器或主 Chrome。
- 浏览器 UAT BLOCKED：仓库 runner 两次均在页面访问前因 headless Chrome CDP 端口 15 秒内不可达而失败；首次为当前会话无法执行 Windows Chrome，第二次改用缓存 Linux Chrome 仍同样失败。两次均未生成页面 report，不将初始化或登录页证据冒充 27 路由 PASS。
- 旧轮未完成项已由下述重启轮部分解阻；历史两次 CDP 启动失败保留作根因记录，不再代表当前 Chrome 可用性。
- 浏览器重启轮已定位旧 Linux Chrome CDP 超时根因为缺少 NSS/NSPR/ALSA 运行库且 stderr 被 runner 丢弃；专用 Chrome 151 + 临时运行库 + 独立 profile + `--no-sandbox` 的 `/json/version` 预检成功。
- 重启轮隔离栈完成 282/282 migration、production-safe seed、bootstrap、strict baseline、API ready 与 Web login 预热；修正本轮 `NODE_ENV=production`/`next dev` 预热冲突后进入业务路由。
- SURFACE_ONLY：3 个民宿具名详情与 19 个列表/工作台入口均只有导航、截图与通用渲染观察；runner 未作 route-specific DOM/交互断言，并绕过 UI 登录。共生成 44 张截图；只能确认 runner 跟踪的 same-origin API 未失败、无已记录 console/runtime error、CSS viewport mismatch 或横向溢出，不能据此声明 HCD Case PASS、全量 Network 或完整移动设备能力 PASS。
- BLOCKED：住房 5 个具名详情、picker 真实交互、窄权限名称裁剪和未知值 fixture。住房 fixture 两次均由约束整笔回滚（canonical park 保护、Party 加密元数据），达到同题上限后停止。
- 运行时证据曾位于 `/tmp/jinhu-hcd-uat-20260902-r3/` 并生成两份 SHA-256 manifest，已随 teardown 删除且未留存到 `artifacts/`，现不可复核。compose 容器/卷/网络、DB/API/Web/CDP 端口均归零，专用 profile/临时文件根/运行库已删除；但 touched-table/fixture residual gate、UI/DB 反串线、设备能力证据均未采集，记 `UNVERIFIED`。未触碰生产、HR、主 Chrome 或他人容器，任务继续保持 `in_progress`。
