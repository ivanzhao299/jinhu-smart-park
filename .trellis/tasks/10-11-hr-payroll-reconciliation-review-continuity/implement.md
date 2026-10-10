# 实施
1. implement子代理读取curated specs及精确现有API/DTO/Web/测试；实现GET历史、原POST互斥目标与所属批次一致性、Web逐人逐项目标和历史/状态/受控重试。只改必需文件，不并行另开代理。
2. API单元+controller/adapter合同、真实隔离PG、实际页面交互及Web HR回归；pnpm --filter @jinhu/api lint/typecheck/build 与Web lint/typecheck/build。需要启动DB时仅用已有可证明为空或专用隔离fixture，并保证cleanup。
3. root独立check子代理全范围复核，完成后root实际浏览器桌面/390px、source hash fence、freshfetch、干净候选PR/CI/merge/部署及运行SHA+health+Dockercleanup。
4. 每个失败保留原日志、只重复必要检查；不重放历史批次，真实工资与岗位验收单列。
