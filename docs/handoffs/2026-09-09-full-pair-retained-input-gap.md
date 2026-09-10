# 全域演练与保留输入的真实接线缺口

## 字段对齐实修：组织遗留层级与管理者引用（2026-09-10）

候选已无冲突合入origin/main，合并提交e248e563；保留此前所有提交与回执。两条pair合同合并后31项通过。

对照旧T0 SQL加载器与当前生产目标模型，排除parent_id、primary_org_id、position_id、org_id等已有派生外键后，发现实际遗漏：组织legacy_hierarchy_level/legacy_manager_reference，岗位reports_to_position_id/hierarchy_level/sort_order，员工legacy_jobstate_code/legacy_jobstate_name。不能把这些遗漏都归为格式适配问题。

本次只修复组织两列：decision producer从source.rating和source.legacyManagerValue生成字段，目标模型将其加入白名单、可空字段及canonical比较。层级受非负smallint范围约束，管理者引用限10字符且拒绝NUL；仅保留原引用，不推断用户或员工外键。没有修改数据库migration、源文件或真实已生成载荷。

定向decision、target-model、payload-generator合同通过；新增边界和canonical差异断言。首次decision测试因合成目标库存缺少新增层级值而触发正确的collision HOLD，已补合成库存为来源的层级1，没有弱化碰撞规则。ESLint对照HEAD确认producer15项、decision测试2项诊断完全相同，非此次引入；没有宣称lint全绿。未运行真实PostgreSQL写入或前端验收。

岗位与员工上述字段仍未补齐；组织新字段尚未从真实保留源重新生成候选并做数据库验证。先沿该已证明字段缺口继续，不把旧T0载荷或旧成功回执宣称为新增字段覆盖证据。当前修改会改变映射内容，后续须由生产者生成新材料，禁止手改旧哈希。

## 续接核验：既有结果复用与远端漂移（2026-09-10）

候选HEAD仍为748776cd。本轮fetch后的origin/main为63731906，候选ahead3/behind6；未合并、未覆盖工作树。新增43个文件变更与LAB_EXECUTION_DEPENDENCIES无交集，也没有apps/api或发布workflow变更，但包含packages/shared/src/property-business/display-labels.ts。computeYuzhouLabExecutionBinding散列整个shared/src，因此不能将“迁移脚本无变化”解释为runtimeTreeSha256不变，也不能把旧执行回执重新标为新提交。

既有未提交的pair复用实现经定向核验：17项合同测试通过，两个相关文件ESLint通过，git diff --check通过。新增入口为`--verify-existing --request <private-request> --request-sha256 <sha256>`；请求保留原A/B配置引用和空输出目录，额外提供existingReceipts.A/B各自的receiptSha256及manifestSha256。它不调用数据库runner、不覆盖旧回执；仅在全部匹配时生成新的安全摘要。错误receipt/manifest pin、不同执行代码均失败。输出databaseStateObservedNow=false、formalFinalRehearsalPairProduced=false、productionImport=HOLD，不是当前数据库观察，也不是正式生产演练放行。

后续收尾已补两个真实Node CLI负例：verify-existing缺少existingReceipts，以及execute-isolated带existingReceipts，均在请求层退出1、stderr为空、输出目录为空；不会进入side配置或数据库runner。19项测试、定向ESLint与diff检查通过。

本轮没有真实装载、源重抽、生产写入或新增Agent。实际旧A/B不同提交的事实未解除。不得靠改hash或删除门禁将其拼成成功。生产plan materializer的metadata消费者要求finalRehearsalPair，但只读取其中摘要；实际正式生产者为final-rehearsal-pair.mjs，返回包含contractSha256、sourceFacts和humanUat状态的完整结果。retained pair输出不是该结果，不能仅转换字段名作为生产证据。下一步沿正式生产者检查已保留输入及各阶段适配，复用已有来源，不重新提取。

## 优先级纠正：已成功writer输入不缺这套抽取目录journal（2026-09-10）

此前将新发现的T0目录来源journal作为成功writer输入的前置缺口，追踪对象不正确。源码证明 `production-import-payload-generator.mjs` 把 `decisions.phaseManifests[phase]` 写为sourceBatchManifestSha256；candidate-freeze与real-artifact-bridge证明这个值是phaseArtifact字节SHA，不是旧抽取目录manifest SHA。

从成功运行原配置所指向的四个records文件获取实际引用后，限定phase文件名、非链接、单文件256MiB/总1GiB读取预算，流式核对38个文件（721412782字节），四个来源工件均找到唯一字节匹配：

- T0：3105条，b7ef494f2cb549149ee8a56bea79f144f680f47f2c2e71e4f867c5e1dbf784c6。
- T1：6887条，df142be203dc5899ef37da56a2f5ec2c729f9961ef248a8a7ba1da479cc8a056。
- T2：1163条，ee40d818d0bc224e269b36436a20a708566b7c045da22e95af33f6c710ae3069。
- T3：249673条，617476a3cee4da4cfa76b74b33cfbf1bbafa3643da9ec9243d693ab20a71af0e。

T0匹配工件类型为yuzhou_hr_production_import_real_phase_staging，C/S/M与原成功输入相同。其余三项本轮仅验证引用字节存在，不扩张为新一次字段/业务或来源数据库验证。没有DB写入或源重抽。

立即停止把无journal的最新T0目录当作上述四阶段成功输入的必要材料。新增内容验证器可保留，但不是生产T0–T3链的必经步骤；不要继续为它补一个与实际writer无关的来源流程。下一主攻点回到正式全域pair与当前执行计划的证据适用性。不得以此定位成功宣称正式pair、生产计划或生产导入已完成。

## 首个实现更新

2026-09-10核验更新：合成planned样例最后更新于29d40d92，其后9个原映射依赖发生变化（T0/T1/T2/T3加载、T0回滚、T1/T3转换及生命周期）。该样例不是历史执行回执。共享T0布局加入正式mappingContractComponents后，仅更新planned样例的M为717597aa5d25b24f7693386adfba527a39f588d6e9f2533e1acd38e015e3d685；生产verifier的精确比较和错误M负例未放宽。全域Slice1合同及14个负例通过；T0新验证9项、生命周期和Slice3回归均通过。没有更新任何真实历史回执身份。

真实只读核验：在指定受控报告根按departments.jsonl精准发现12套六文件T0材料，选择最新manifest的一套，manifest SHA f07720223dfdb3d2c3adadf87dd129a86ea0b159e10f8f5831268165348762f4。六文件均通过权限/链接/字节哈希检查；manifest声明组织138、岗位18、员工2949，以及三个状态元数据域7/5/8。行数只是声明，未重新解析业务行。manifest pin来自当前本地观察，不是独立源身份背书；sourceBindingVerified/rowCountsVerified/lifecycleReady仍false。未复制/回显业务内容、未写数据库。下一步将这套实际文件hash关联原恢复回执及来源journal，不得把内容验证自动升级为来源或正式A/B通过。

新增 `verify-yuzhou-retained-t0-files.mjs`，消费固定私有目录与预期manifest SHA，校验六类T0文件固定布局、权限、非链接、字节哈希和读前后身份。摘要读取有64KiB上限，业务文件只流式摘要，六文件总读取上限384MiB，支持空文件，不解析或返回个人字段。输出只含固定域名、哈希、字节数与manifest声明行数；明确 `sourceBindingVerified=false`、`rowCountsVerified=false`、`lifecycleReady=false`，不能直接拿去执行load。

T0布局提取为共享常量，原生命周期使用相同布局，不修改原extract/journal门禁。新增9项正负例通过，生命周期回归脚本通过；新文件ESLint通过。原生命周期55项ESLint诊断经HEAD版本对照完全相同，没有在本切片消除。另一个全域contract测试在第31行的样例mappingContractHash与computeMappingContractHash比较失败，两哈希来源须下一步核对，不能盲改样例hash或宣称全域验证通过。相关contract/样例文件本轮均未修改。

当前实现只到内容验证，还需要核对真实保留T0文件的格式、原source run/journal及来源绑定，才可以设计新的retained journal分支。本轮未执行任何真实装载或修改原材料。

## 本轮只读核验

- 当前候选基线为 `7938f4d8`。T0–T3 的真实成功发生在 `163a47b0`；保留原执行身份，不重新标记。
- `run-yuzhou-retained-bundle-pair.mjs` 只证明两侧数据库生命周期；明确不生成正式全域 pair，也不证明独立可信根和容器资源清理。
- `final-rehearsal-pair.mjs` 要求全域、P0、备份故障、反向回滚与资源清理；不能以普通 pair 替代。
- `full-domain-lifecycle.mjs` 的 `extractManifestFacts` 要求 run staging 中的固定文件及哈希；后续 journal 校验仅接受本 run/C/S/M 对应的 `kind=child, phase=extract` 记录。没有已保留输入的独立接入分支。
- 对指定受控报告根进行了最大5层、仅文件名匹配 final/pair JSON 摘要的限定检索：6739个文件名中没有找到具有 status/rehearsals 的匹配摘要。不是对全机、归档或其他工作树的穷尽检索，不能据此宣称历史证据被删除或从未存在。
- 主生产计划的阶段是T0–T3；T5非文件存在独立绑定，不应将主计划称为已经覆盖全量工资、照片附件的统一执行器。

## 下一实现边界：显式 retained 输入，而非伪造 extract

1. 先核对旧全域 staging 与当前 prepared payload 的格式：二者不能按文件名互换。按域列出原始提取 manifest、文件哈希、源恢复回执及转换合同；只有存在且验证通过的输入才能接入。
2. 增加独立的 retained-input descriptor 与纯验证器。它保留原始 source run/triple/manifest，另记录本次消费 run/triple 和经验证的依赖适用性；不修改旧 manifest、日期、C或journal。
3. 依赖不同或格式不同必须明确失败并列出技术分类；不能通过复制hash、重命名文件或无条件重绑C宣称复用。已存在的脱敏隔离决定与来源守恒必须保留。
4. 通过后再扩展生命周期：journal使用独立 `retained_input_verified` 事件，不伪造一次 extract 子进程。旧 extract 路径行为不变，load只能消费已校验的两种明确来源之一。
5. 保留源材料为只读外部引用，清理registry区分 owned 与 retained reference；回滚和cleanup绝不删除原始输入。若旧加载器必须本地staging，应先改其显式输入路径接口，不能私自复制个人数据或用未核验符号链接绕开约束。
6. 用合成测试覆盖缺失、哈希漂移、跨源/跨域/跨run、映射依赖变化、额外文件、符号链接、重复journal和cleanup误删；再做一个真实域的只读输入验证，不启动全量加载。

## 后续仍需完成

retained输入接线成功不等于正式A/B完成。正式运行仍需当前代码的实际加载/业务和角色验收/故障恢复/回滚证据，生产还需同提交发布、目标基线、备份及执行授权绑定。照片附件和工资发放保持各自执行边界。

本轮未改业务代码、未访问业务行、未重抽、未新建数据库、未运行装载。下一轮优先实现上方第1–2项的一个有界域，不能再次把本说明当作已实现的适配器。
