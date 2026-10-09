# 技术设计

复用服务端attendanceRequestWorkDates，增加只读已批准申请重算计划接口GET /hr/attendance/requests/:id/recalculation-plan（具体路由沿现有请求路径核对）。使用UUID管道、现有HR_ATTENDANCE_OPERATE、主体验证租户园区和必须成功的元数据读取审计；查询当前未删除申请及员工。投影仅requestId/requestNo/requestType/requestVersion、employeeId/employeeCode/employeeName、workDates。无已知日期返回空集合并在页面解释；未批准状态拒绝计划。不得暴露reason/sourceTrace/私人字段。

Web新增薄传输类型与计划GET，现有recalculateAttendance增加可选idempotencyKey参数，省略时兼容旧调用。日期不在前端重新推导。用独立重算办理组件管理精确申请上下文、只读计划、逐日状态和键；在现有申请记录接入HR运营动作，父级维护全页busy及日/月刷新。每次开始/继续重读计划并比较版本/员工/日期，变化则停旧计划，要求重新核对。

序列执行已有日POST，每日固定body与key。成功的日期保留结果ID，不重复调用；未知失败保留key从该日继续。停止按钮只停止尚未发出的日期，不中断在途写入。页面离开可丢弃本地办理草稿，已提交日版本仍由服务端保留；卸载后的完成不得污染新上下文。不得构造全局新作业引擎或单独月份算法。

部分成功也刷新当前日/月视图；刷新失败单列，保持成功日与重试位置。沿用月份锁、review回退、closed不变及显式更正，不增加迁移、工资规则、权限或生产导入。

独立工作树C：/Users/mac/.codex/worktrees/hr-training-operation-continuity-20261009，分支codex/hr-approved-request-recalculation-20261010，基线5bea1106cf694a36c89832ddaaeef273cf8c117f。A为PR919候选 d7a1cffa5781b09e39fc31b69973e67f35a8908c 与发布跟踪器36961（CI37998668358）独占，不得修改。

发布时间安排：PR919合并并证明同树后即可基于最新main整合本批、并行执行CI；本批合并/生产部署仍等待前一批运行版本证明。这样缩短等待且不重叠生产发布。
