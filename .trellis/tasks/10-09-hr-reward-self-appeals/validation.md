# 验证与边界
- API 17项通过（8项本人申诉service/DTO，4项奖惩既有契约，5项类别版本）。覆盖scope含super、actualowner、approved、required audit在history之前、own历史过滤、TEAM+SELF列表并集及树外本人detail降级self。
- owned PG loopback15489随机库通过：并发HR correction与本人appeal序号互异、原approved整行不变、自己只见自己创建appeal摘要，其他账号/HR私有更正不进入self，混合权限列表可达，非approved和其他员工拒绝。是minimal SQL contract fixture，不是完整迁移或真实生产业务验收。测试库drop并断言；--rm临时container已移除，无卷。
- Web40项通过：本人申诉5、更正6、真实父页面19、adapter2、类别版本7/adapter1；共用写锁与独立草稿，未知结果same key、修改body阻断，保存成功后只读重试、bad/missing ownAppeals、capability与SELF交集。
- HR222回归通过；API/Webtypecheck、affected ESLint、build通过。既有Next ESLint插件/canteen warning未扩展修改。
- in-app browser真实组件+合成API desktop/390px，clientWidth=scrollWidth=390、按钮44px；草稿失败保留，重试后第2条本人申诉与保存提示均显示。tab20及本地18794服务已关闭。
- 依赖PR903 authored candidate adf956aa集成；发布前必须再接入其实际merged main并聚焦复验。未重放历史导入、无DDL/seed、无生产业务测试写入/账户权限变更。
- 真实HR/主管/员工生产UAT、实际薪酬月份对账、原端规则等价、申诉受理与裁决的完整流程仍独立待验收，不能以本次追加入口宣称全量复现。

实际主线已接入PR903 squash b5a0284ecd：其树等于authored adf956aa，own commit rebase后验证树99668a6fb41735102acdd4021df8e1077d16429a逐字不变；代码/依赖/环境未改，复用上述测试证据。
