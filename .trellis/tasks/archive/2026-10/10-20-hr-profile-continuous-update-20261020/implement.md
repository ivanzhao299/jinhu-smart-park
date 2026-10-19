# 实施顺序

1. 读取task及引用spec，完整追踪33字段DTO/entity/service、通用增量验证/基线/读写、离线producer/描述和现有测试。记录准确文件/差距，不重复旧源分析。
2. 一次补齐规范化profile字段契约与实际验证持久化，诚实同步生产者/接口描述边界；保持已有来源身份、原证明和旧包语义。
3. 复用现有独立PG fixture，增加完整HTTP/正常业务修改/来源重放冲突/窄角色回读证据；新增检查应能发现真实断链，避免镜像实现测试。
4. 跑受影响契约、真实PG及API/shared lint/typecheck；若改Web需页面桌面/390px实际检查。不要为了计划强改无缺口页面。
5. 独立trellis-check全scope审查并修复；根任务复核证据再按standing授权合并部署。全目标保持active，真实角色/工资/原规则验收不被本包替代。

必须记录：changed files、确切命令/结果、跳过原因、环境/源码fingerprint、owned fixture清理及未解决差距。
