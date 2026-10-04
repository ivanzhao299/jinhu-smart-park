# 培训历史持续导入适配（执行器待接入）

生产只读任务37225451169于2026-10-04T18:43:01.544Z确认：指定迁移园区dbo.trainhis来源2、绑定归档2，但正式培训计划、参与者及来源匹配投射均0。此时API6155574e0、Web9ef3a6429。不能以此前离线映射或本地投射测试证明现代培训已承载。

`scripts/hr-cutover/yuzhou-training-incremental-projection.mjs` 是同一持续导入链路的离线候选转换层，尚未接入公共构包或API，不可直接上传候选。完整交付仍包括事务执行器、来源基线/幂等账本、现代更正保护、公共preview/commit/status、分包、发布和真实业务验收。

转换复用已审定的dbo.trainhis.person、coursename、startdate、enddate和hours规则：

- 来源id为SQL Server int，身份摘要为SHA256(`dbo.trainhis` + NUL + 原id)，不按课程名或批次生成身份。
- 原行摘要及一次明确旧传输解码由现有readT5RetainedSource验证，不修复摘要。员工索引提供准确dbo.person来源身份，不按姓名关联。
- 课程名必需且最多160字符；起止日期取原无时区ISO时间的本地日期部分，验证日历、时间和顺序；学时为1至999999的整数。异常不能默认当前日期或一学时。
- organ、attainment、test、trainmoney、memo保留原资料及逐字段待接入说明，不猜提供方、分数、结果、币种或评语。未知非空新列失败，只重验变化范围。
- 候选事实摘要不含提取时间、批次或未投射字段；原行摘要仍反映所有原资料变化，不能把未投射字段变化当成已更新现代业务。

后续执行器认证来源、员工作用域和权限，单事务创建课程版本、计划、参与结果及来源账本；重试不重复创建。发布快照和完成结果不可直接覆写，源修订经过三方比较，合法结果变化追加更正，现代人工更正保留。未知首次基线不能用当前值冒充。

验证命令：`node --test scripts/e2e/yuzhou-training-incremental-projection.contract.mjs`。目前仅候选转换层验证，无公共API或真实PG写入验收。两条旧历史不默认进入高成本修复队列，后续真实培训数据进入正式业务的接口接入继续推进。
