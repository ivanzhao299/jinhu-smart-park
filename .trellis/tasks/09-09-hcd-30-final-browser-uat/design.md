# Design

复用 L-04 的 dependency-free raw CDP runner、case JSON 和 disposable compose 资产，不另建浏览器框架。运行时以新 run id、隔离端口、隔离 compose project/volume、临时 mode-0600 凭据文件和专用 Chromium profile 为边界；teardown 只清理本轮带标签资源。

矩阵输入从原 HCD 审查报告和 retained L-04 case file 派生。动态详情 ID 必须由本轮 disposable fixture 解析；每 Case 的断言覆盖其原始缺陷语义，而不是只证明页面可渲染。runner 输出每 route/viewport 的 DOM assertions、脱敏 Network、截图以及总 manifest。最终报告逐 Case 引用本轮 artifact 相对路径与 SHA-256，不提交 artifact 本体。

若矩阵暴露 HCD 显示缺陷，先按相同根因聚类，在现有 shared label/picker/detail/design-system 模式内做最小修复，再只复验受影响 Case 和必要的完整门禁；同根因最多两次。环境/runner 问题不得用产品代码掩盖。超范围问题登记 GitHub Issue。

PR 只包含任务内源码、测试、报告和 Trellis 记录；ignored evidence 留在本机。合并使用 GitHub squash merge，main 由远端门禁推进，不直接 push 或操作生产。
