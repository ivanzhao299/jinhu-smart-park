# 实施

1. 在最新主干独立 codex/hr-date-range-scheduling-20261010 候选完成本片；保留其他工作树和脏文件。
2. Trellis implement 子代理只负责 apps/web/app/hr/attendance/AttendanceDateRangeScheduleEditor*、HrAttendanceClient.tsx 的最小入口、新组件专用 CSS 和对应交互/纯函数测试。不改其他已有组件/API，必要共享 helper 先报精确范围。
3. 父代理负责计划、实现审查、实际组件桌面/390px检查、最终合并和单发布写者跟踪。
4. 交互覆盖：空权限/无员工、非法日期/第32日/闰日/跨月、只读失败、混合新增调整不变、原因、双击、部分失败稳定键续办、停止、重读不丢成功/未确认请求、版本冲突、上下文/卸载/StrictMode、刷新失败与成功分开。
5. 子代理跑 focused Vitest + Web typecheck/lint，输出真实结果。父代理审查并跑完整 Web 单测、HR合同以及构建；代码/依赖/环境不变时复用已通过结果。已有 API/PG算法无变化，不重复历史导入或全链PG演练；CI仍按实际范围执行。
6. 桌面/390px以真实编译组件和合成 transport 验证部分成功/续办/换行；不能签署真实岗位 UAT。
7. 按最新主干同步、候选/合并同树、健康/部署清理/API-Web版本证据串行发布；继续保留全任务 S0-S7、双源原子等价及独立产品验收要求。
