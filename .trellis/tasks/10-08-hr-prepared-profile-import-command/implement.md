1. 读取 actual prepared controller/service/repository、incremental status/commit返回格式及normal auth调用；实现纯Node CLI与可测试函数。
2. 实际隔离HTTP fixture覆盖正常/失败/未知结果，绝不接生产。与原profile批次/prepare contracts联合验证。
3. 父任务更新docs、7段code-spec及CI现有HR准备测试命令，独立review后提交和发布。真实生产commit仅使用用户已有密码与正常API，并单writer。没有密码不阻断接口开发，正式落库保持未证明。

服务端范围补充：仅在现有 previewed 操作的相同包锁与行锁下重建计划，无新增账本/业务写入，终态原结果不变。新增真实 PG 回归。显式计划刷新键与原 preview/commit 键分别保留。

最终验证：HTTP14/14、原profile projection9/9、真实incremental PG1/1（非skip，临时DB残留0）、APItypecheck、affected lint、MJSsyntax、diffcheck通过；独立审查修复conflicted终态展示及commit失联一次只读恢复。真实生产commit未执行。
