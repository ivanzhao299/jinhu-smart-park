# 技能字段证据引用恢复

原 KNOWHOW_FIELD_EVIDENCE_DRIFT 的 private_stage 指向 25a4c9df 前的 adapter 字节。git 历史证明预期 hash 正是该旧版本；reviewed diff 仅增加 profile 身份歧义隔离规则，技能字段投影未改。writer 增加独立 follow-on 入口且复用既有 insertTable，技能列及旧写入路径未改。只更新这两个 reviewed hashes 和冻结 manifest 的 FIELD_KNOWHOW 引用。

新增 private_stage 错 hash 反例；字段/adapter 12、writer/rollback 14、冻结 manifest 10、progress 11，共47通过。完整 progress CLI 恢复输出。字段稳定标识、分母、得分、等级字典缺口和 HOLD 安全策略未改变，不以引用同步获得新业务等价信用。

当前可证明指标：目标字段契约223/2364、旧例程实现并测试6/212；集团Web准备任务10/186，真实运行等价0/186。它们是源码证据口径，没有总体产品完成率。默认工具没有外部生产回执，因此其生产证据0/8不能推翻此前实际完成的T0-T5导入。

本轮不改应用、DDL、权限、规则、源数据或生产运行。前端检查及应用构建未重复，因为只改证据JSON和Node契约反例；生产候选PR774保持ea68d177及已有完整CI结果。人工发布决定、真实角色/岗位验收与实际工资期间/账套确认继续待处理。
