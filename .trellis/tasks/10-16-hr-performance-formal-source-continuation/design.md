# 正式承接设计输入（预检进行中，写入schema/API尚未冻结）

基线9ed1e4b8；复用父design v2和已发布370/371/372。第一步子任务hr-performance-source-readiness仅取当前生产计数/摘要，不代替本任务交付。

## 存储与读写边界
保留不可变六表facts/旧target和旧成功回执。新增独立正式业务草稿aggregate、append-only修订、完整source manifest及承接link/receipt；manifest按同scope/batch的稳定事实身份排序，保留完整候选、独立detail和所有源字段的V/R/P归属。相同manifest可共享，避免反复复制整个备份。正式current值与原始证据分开；同人同期间多个master不能合并覆盖。

## 当前关键守卫约束
372 input初始化仅允许全部UNPROVIDED；正常PATCH仅能改当前阶段/真实角色允许字段。因此把源评分直接灌普通PATCH会失败，不能删掉当前守卫或伪造已提交状态。写入方案必须在新向前迁移引入一次性、receipt绑定的来源baseline初始化：仅新建且未办理、当前头为空baseline的review，锁cycle/review/receipt、重验完整manifest及draft revision、真实导入作者/时间和权限；初始化仅预填值，不推进self/manager/calibration或确认。不允许客户端传trusted=true/sourceQualified=true或绕过阶段的通用开关。普通后续PATCH完全沿现有守卫。

372周期selected_employee_ids目前仅合法纠正路径，普通createCycle按组织发布。承接需有独立receipt绑定的显式选择路径，不借纠正伪造predecessor，也不能全组织生成。复用发布冻结/初始化，所有额外允许条件必须DB直接写反例验证；同sourceMaster仅一个明确review实例，另一个master另行候选/周期，不按人月份去重。

## 资格与缺项
sourceQualified必须由完整来源/成功receipt/000309双路resolved+matched/身份/manifest计算，永不从前端接收。manuallyResolvedForNewBusiness独立真实actor、理由及绑定版本，不给历史信用升级。日期不从recorded_at/session猜；缺日期/身份/政策只保留可编辑业务草稿，历史记录沿归档策略，当前业务由用户补明确字段后才启用。生产预检先确认哪些分支实际存在，再冻结完整qualification SQL。

## 权限与API/页面方向
复用绩效模板/业务工作台和既有权限，增加业务草稿/承接预览、保存修订、绑定及显式启用动作，具体路由/DTO在下一轮精确inventory后冻结。普通表单用业务名称，来源provenance在详情追溯；不加“玉舟旧数据”或全局数据阻断。薪资参考19,4始终独立薪酬读写权限投影；源operator/assessment_person/recorded_at保留来源证据，正式作者/关系/时间真实记录。未确认源值不默认为0/NULL，不伪造审批。

## 幂等与增量
按模板版本/review草稿为原子单位，先锁target parent/current head，重验source hash与expectedBaseRevision；同key/body回放，异body409，不同key同来源目标复用业务唯一键。新来源版本追加候选；已有人工修改409零覆盖，只能显式差异选择后的新修订或既有确认后纠正。捕获原payload/key、失败保留与迟到响应校验。

## 兼容、测试、发布
不修改任何已应用迁移和旧算法/source信用。写入实现前补齐确切schema/API及守卫清单/字段矩阵；实际PG/HTTP覆盖source初始化直写绕过、重复/并发/源漂移/人工修订/跨scope/工资权限/缺件/完整集合和旧dimension生命周期。真组件桌面/390px及发布/runtime验收，最终真实岗位验收仍属父E。

## 待预检后定案
真实source/receipt/identity/template匹配分区及既有formal链接；可复用的目标版本/当前业务范围；上述新草稿、receipt、一次baseline初始化的准确表列/DTO/函数签名。此文件不授权尚未冻结的写入代码，不表示正式承接完成。
