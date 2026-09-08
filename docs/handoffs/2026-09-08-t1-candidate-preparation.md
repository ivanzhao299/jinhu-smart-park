# T1 当前候选准备状态

候选提交：f3e0c3b880631254197489e2e22fc84fb80aa570。

- T0 当前阶段 3105 条：3100 条拟插入、5 条隔离。仅候选，未写入。
- T1 当前阶段 6887 条；现存阶段文件通过来源清单哈希匹配。
- 用现存 T1/T2 字典源文件及当前 buildCoreNonT0DictionaryPackage 生成新四字典包。原包保留。旧状态 0 为 reject，当前规则为 map/needs_review，不应丢失此类历史事件。这里只生成私有文件，未物化数据库字典。
- T1 候选生成失败码：PRODUCTION_IMPORT_T1_DECISION_CODE_INVALID。尚未生成 T1 候选，不得称导入或决策完成。
- 根因位置：materialize-production-t1-decision-candidates.mjs 的 currentHead 对整个 scripts/hr-cutover 目录检查脏状态；当前有其他兼容开发的未提交修改及准备辅助脚本。
- 只读追踪字面量 import 和 new URL 资源所得 40 个依赖文件均无修改、无缺失。这不是动态依赖完整性的证明，不据此绕过 currentHead，不使用 head 注入参数运行真实候选。

下一步：检查实际动态依赖和现有代码身份检查模式，选择可验证的依赖范围检查或完成相关修改整合；保留其他 WIP，不整体提交、不新建工作树、不重提取源数据。新包保留并复用，不因入口失败重建。

## 后续执行结果

已用 git archive 从上述真实 HEAD 生成临时代码快照，使用独立临时 Git index 执行原入口。没有修改 currentHead、没有注入 head 回调、没有新增注册 worktree 或分支；原工作树和 index 保持原样。执行完成后已删除本次临时代码快照及定位文件。

T1 候选生成成功：6887 = 6883 拟插入 + 4 隔离；skip_exact=0，review_target_collision=0。四条隔离的稳定原因均为 EMPLOYMENT_EVENT_EMPLOYEE_NOT_MAPPED，未猜测员工归属。artifactSha256=4511b4e1604fb0ae81c420d073b671db440fd22188c2960d5d7a453b1e69ac94。此前入口失败已通过干净的已提交代码执行方式解除，不需要收窄安全检查。下一步为 T2/T3 候选，复用当前来源文件，不重新提取。

## T2 / T3 接续

T2 原入口在已提交代码快照中成功：1163 = 1155 拟插入 + 8 隔离，目标碰撞 0。含合同类型 4、合同 802、合同变更 357。实际例程字节校验后的分类为续签 349、缺失父合同待审 8；没有猜测父合同。候选 SHA 为 ebb598bd41007b337ced1295c9a5ae927e46d1695e8f5fd9bed777237bc24fe8。

T3 第一次入口检查失败是临时 index 位于代码快照内部；第二次将 index 放在快照外，完整 Git 状态检查通过。复用同一准备配置后，原入口报 T3_MATERIALIZER_STAGE_INVALID。没有 T3 输出成功、没有数据库写入。

只读按域调用实际 verifyProductionT3StagedRecord 定位：考勤 144 全通过，社保政策 12 全通过，保险 35008 全部因新顶层 legacyCompatibility 与旧 exact-shape 合同不一致而失败。该字段来自之前已提交的提取/转换扩展，不能通过删字段或宽松忽略来解决。下一步必须将兼容标记贯穿验证、目标投影和查询承载，测试错误类型拒绝与完整保留；不重新提取数据。

## T3 兼容标记修复（本地）

production-t3-field-projection 严格接受保险专属 legacyCompatibility：六类标记与子项一致、七个 presence 项必须为布尔值、禁止多余键；旧格式仍可验证但不凭空补充证据。正常及缺失期间的隔离投影将完整标记保存在 source_snapshot.legacyCompatibility，输出与输入不共享可变对象。

payload JSON 安全扫描只对 hr_employee_insurance_period.source_snapshot.legacyCompatibility.fieldPresence.insureaccount 的布尔值作精确例外；同路径字符串、其他位置账号字段和 password 均继续拒绝。现有 API 代码已读取该 JSON 子路径，但其中的未提交 API 修改未在本轮整合或运行验收，不能宣称发布完成。

相关候选/政策测试 23 通过，通用 payload 合同 1 通过；增加缺失期间隔离断言后候选测试 14 通过。实际阶段只读验证：考勤 144、政策 12、保险 35008 格式全部通过；保险正常投影 35003 条完整保留标记，5 条未生成正常目标字段，仍需在后续异常路径核对，不宣称全部可插入。未改源文件、未写入数据库。

5 条异常记录已逐条走实际隔离投影：原因均为 T3_INT4_INVALID，兼容标记 5/5 完整保留。因此正常投影 35003 + 隔离投影 5 = 35008，未丢弃标记；不代表异常已经修正或允许正常插入。定向 ESLint 与 git diff --check 通过。

临时代码快照均已移除，没有新增注册 worktree。

productionImport=HOLD。全目标未完成，生产身份、已部署提交和写入验收未在本轮核验。以上是候选记录，不是数据库装载或用户端验收。
