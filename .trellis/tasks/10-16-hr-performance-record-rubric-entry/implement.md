# 实施顺序
1. 基于已发布e8a3b60ac且干净的旧发布工作区复用，分支codex/hr-performance-record-rubric-entry-20261016；主工作区和PR979发布工作区不写。
2. 读取精确组件、CSS、parseLegacyQueryId、API/types、相关用例/合同/规格，确认现有可用接口与权限，禁止重复造评分标准API。
3. 单实现者修改组件及必要局部布局，补真实交互回归；运行所有相关绩效套件、Weblint/typecheck/build及适用HR合同，重型验证串行。
4. 串行独立检查；root用私有合成transport编译实际组件做桌面/390px检查，绑定最终sourcehash。合成验收不等于生产岗位证据。
5. 新鲜fetch/差异重叠、提交PR、既有范围CI、合并与发布。纯Web不无理由强制全库恢复烟测；不弱化已有门禁。按实际Web-only范围分别核对API/Web运行版本，避免要求未改API升级标签。
