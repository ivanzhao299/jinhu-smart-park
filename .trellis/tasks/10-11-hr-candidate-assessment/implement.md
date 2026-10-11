# 实施

1. 读取现有招聘服务、DTO、Web transport/UI、权限和幂等/敏感读取及history模式；检查现有映射不重复建立。
2. 创建source-field契约及forward-only测评migration，API DTO/service/controller与聚焦单元/真实PG测试。
3. 增加typed transport及CandidateAssessment组件、挂接页面、局部CSS；实际交互测试关键路径。
4. 实施者运行聚焦测试、API/Web lint/typecheck；checker独立复核并修正；根代理独占PG生命周期及浏览器。
5. 根代理运行真实一次性PG、实际桌面/390px检查；最新main同步后聚焦质量门、提交PR/完整CI。
6. 精确SHA合并并跟踪生产部署到终态，证明API/Web运行SHA、health/readiness及postdeployDockercleanup；更新总任务检查点，真实角色与双源兼容验收不得算完成。

不启动生产业务写入，不重放导入，不重复历史分析。DB测试仅一次性本地数据库，唯一owner根代理负责创建/删除。实施者可准备测试文件但不得自行创建/复用DB。
