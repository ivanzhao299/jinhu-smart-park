# 建议与投诉页面

`/hr/employee-feedback` 使用 HrEmployeeFeedbackClient 和独立 employeeFeedbackApi，Shared合同来自hr-employee-feedback.ts。现有本人档案不复制，工资不读取/写入。

- PermissionGuard整页必须有可见403；hr:approvals AND(self_manage OR park_review)；team_review不发起敏感读取。后端context确认live能力和实际employee绑定，未绑定本人显示说明，HR无需本人档案。
- DS页面、panel、记录卡与按钮；桌面及390px检查，用户内容white-space:pre-wrap/overflow-wrap:anywhere；表单受控textarea保持换行，Unicode codepoint计数与服务端同限，HTMLmaxLength使用2倍上限避免astral截断。
- 原请求path/body/key/token/expectedVersion保存在operation对象；同步mutex防双击。网络/5xx/仍processing409/非法回执视为未知结果，冻结表单/选择/过滤和分页，只能同原请求重试。明确4xx保留草稿/HR回复，不显示虚假成功。
- 回执严格只有id/version/status/actionId，校验目标id/版本+1/预期状态后发布。确认保存与后续读取分开，读失败保留回执，仅刷新读取。编辑内容未保存不允许提交旧内容。
- Auth身份/tenant/park/permissions/token的key变化整体remount，清除旧私密数据；读取AbortController+selectiongeneration丢弃晚响应，写入alive/generation防旧完成覆盖新上下文。
- 列表与历史各自分页，筛选kind/status；选择改变同步清空旧详情/历史/草稿/回复/原因，完整快照通过details展开。无CSV/其他员工私密字段/工资投影。
- Sidebar canonical route仅页面基础权限metadata，不把permissions数组当OR（既有消费者是AND）。HR工作台真实链接明确self|park gating；权威user menu_tree保留既有展示规则，不伪造菜单授权或增加默认角色。

聚焦验收见 docs/testing/hr-employee-feedback-workflow.md。合成组件/HTTP与真实生产岗位、旧端规则等价分别报告。

## 独立读取与实时范围恢复

- 手动“刷新读取”先重读 context。employee.id/canSelf/canHr 变化时清空旧选择、详情、历史、输入和回执，再按新的可用范围读取；明确401/403同样清空。网络/5xx保留填写内容并可重试。context不变时保留当前mine/hr选项。
- 详情与历史分开请求；历史翻页/失败/重试不能重新载入草稿或隐藏可用详情。刷新遇到未保存内容时保留输入及其原expectedVersion，不将新版本套到旧编辑上；重新选择记录才明确丢弃输入并重读。

- 本页只有卡片列表，没有配对桌面表格，容器使用全宽度可见的 `ds-scene-grid`；不得使用默认桌面隐藏的 `ds-mobile-record-list`。本人、HR和拒绝访问页面共享本页panel布局留白，保留全局DS色彩、边框和按钮规则。
