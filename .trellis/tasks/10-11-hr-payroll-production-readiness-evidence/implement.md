# 实施
1. 子代理读取当前表定义/服务setup及source months/考勤社保工资状态，复用固定范围诊断模式；实现脚本、独立测试、workflow可选路径及必要docs。
2. 用真实专用隔离PG（既有jinhu-smart-park-postgres宿主15432，唯一命名jinhu_hr_migration_lab数据库；350迁移）验证固定scope、月份有序/截断、软删除/控制回执/同月输入、只读拒写、失败不伪零及隐私。测试数据只在临时库，完成独立cleanup0；用原成功runner，不重建导入流程。
3. 独立trellis-check子代理复核SQL/schema/workflow/failure边界；仅源码变化后重跑相关检查，root完成hashfence/fetch/PR/CI/merge/fulldeploy+实际runtime+cleanup，再显式只读productionprobe。无前端改动无需浏览器布局复验；真实角色UAT另列。
4. 保存实际生产月份/输入缺口汇总和下一步任务，不猜最新完整月份和规则。不因本片而关闭整体目标。
