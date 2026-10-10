# 实施顺序
1. 阅读现有回聘规范、probation/departure连续办理、API/backend规范以及全部相关真实代码。
2. 仅补既有onboarding版本投影与可选幂等key；添加有意义公共service/adapter测试。
3. 回聘受控草稿、冻结原操作与真实回执/版本覆盖、现有业务字段显示；补完整负向交互。
4. 实施代理最终API/Web类型lint与聚焦测试；独立check全部范围修复；父代理构建/浏览器/HR回归。
5. 基于最新main整合与CI，接现有发布队列，不并发生产写者；部署/清理/实际APIWebSHA，保留真实岗位验收。
