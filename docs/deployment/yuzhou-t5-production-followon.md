# 玉舟 T5 历史追加

T5 包含 23 个源域、20,163 条历史记录。现有非文件生产适配器只覆盖四个域，不能据此宣称全部履历已经导入。历史追加必须绑定真实核心导入回执、源快照与映射版本，并保持已有工资和业务记录不变。

`t5-production-protected-values.mjs` 只转换 typed `materialized` 受保护字段。它验证原密文认证标签、脱敏值与字段结构，再用调用者提供的当前 Party keyring 重加密，并按独立身份散列密钥重算指纹。原始归档、源身份和源行散列不变。密钥与明文只在内存中使用；函数不连接数据库，不更换生产全局密钥，也不声称已经证明生产密钥兼容性。

生产调用方须只读核对当前 API 的真实 keyring、运行版本和目标范围，验证源文件散列，记录转换计数，并将实际目标完整行的散列纳入写入回执。生产调用受控追加入口，不得运行面向实验库的 legacy loader。

`t5-full-archive-private-stage.mjs` 认证全部 23 个域、20,163 条源记录，以及 19 条私有定义和 190 个逻辑字段的只读证据。它保留已认证的原始文件字节，按照提取器的 PostgreSQL COPY text 约定先还原成对反斜杠，再解析 JSON。文件域不含 `domain` 字段，训练和奖惩归档域采用源转换器的明确定义；不能以批次清单的展示域代替记录域。零行源文件仍须是当前用户所有的 0600 普通单链接空文件。定义和逻辑值始终禁止执行。该读入组件不连接数据库，也不授予写入授权。

验证命令：`node --test scripts/e2e/yuzhou-t5-production-protected-values.mjs`。测试使用合成密钥与数据，调用真实 API keyring 解析器，覆盖轮换后的活动密钥、独立身份密钥、空值、错误源密钥、坏标签、脱敏漂移和缺失字段；测试通过不表示生产已经写入。

全域读入验证：`node --test scripts/e2e/yuzhou-t5-full-archive-private-stage.mjs`。合成完整规模源数据验证转义还原、空域保留和禁止执行标记，并拒绝文件篡改、遗漏空域和替换清单。

`t5-followon-core-owners.mjs` 在同一事务中核对已成功的核心操作、四个阶段的 payload 散列和准确的目标范围，再读取 T0 员工记录、projection receipt、有效 `legacy_record_map` 与未删除员工。源编号只作精确查找，最终归属由该核心操作的 SHA-256 源身份和记录映射决定；不能套用实验库的 `person=编号` 主键，也不能按姓名、当前在职状态或修剪后的编号猜测。全部 2,938 个员工须具有唯一编号、源身份、目标和映射。全域分类保留原始记录对象，将找不到归属的历史记为 `unmapped`，无员工编号的字典和文档记为 `notApplicable`。

归属验证：`node --test scripts/e2e/yuzhou-t5-followon-core-owners.mjs`；实际隔离 PostgreSQL 验证：`node scripts/e2e/yuzhou-t5-followon-core-owners-postgres.mjs`。后者建立一次性本地实例，验证 2,938 个合成员工的实际 SQL 查询，涵盖离职员工保留和映射失效、错误主键、跨园区、软删除、回执批次漂移、已回滚记录、重复编号拒绝，结束后删除所属实例。它不读取生产地址或凭据。

`t5-followon-binding.mjs` 将 23 个源域（含空域）、私有定义、逻辑指纹、目录、真实核心和工资追加回执、目标范围、执行版本、运行观察、生产密钥观察、审计操作者和照片证据绑定到独立的一次授权。源内部映射 `d44b...` 与核心总映射散列分开核验。窗口最长一小时；追加签名不能用于回滚。验证：`node --test scripts/e2e/yuzhou-t5-followon-binding.mjs`。

`000317_hr_yuzhou_t5_followon.sql` 增加独立操作、一次签名使用记录、加密原始证据及多目标回执。它不重开已经成功的核心或工资操作。原始 20,163 行及 19 条定义均保留加密证据；定义 SQL 始终惰性保存。每个源域的总数、20,182 条源证据回执、63,992 条资料投影和 2,949 条照片源回执须在提交前守恒。资料中的重复证件指纹按原 loader 的 `EMPLOYEE_PROFILE_IDENTITY_AMBIGUOUS` 规则记例外，原始档案仍完整保留。不能删除唯一约束或任选一个重复证件归属。

`production-import-t5-followon-writer.mjs` 使用 SERIALIZABLE 事务、新授权和新批次，先核对真实核心和工资父操作，再写原始证据、16,211 条可见历史档案、3,952 条文件逻辑元数据、现有七种资料表和员工照片。首次追加要求本范围的历史目标表为空；生产已有普通上传不受此空表检查影响。批量写入后执行所属表的 ANALYZE，再计算回执和完整目标行散列，避免新表估算把 56,031 条扩展资料规划成重复范围扫描。回滚仅删除回执证明属于该操作的目标，保留审计批次和回执，并要求新回滚签名及当前事务授权。

照片输入必须是有源快照、恢复回执、源内容、标准化回执及 worker 镜像散列的实际标准化文件包。完整语料有 2,949 条照片源记录，2,155 条有内容、794 条为空，2,150 个不同图片文件。按实际核心源身份核验归属，无法绑定的照片保存其原始证据和图片，但不猜测员工。`sys_file` 使用现有 `hr_employee_photo`、准确员工 UUID、真实 JPEG 内容散列及既有下载入口。文档源不存在二进制的记录只保留元数据，不伪造可下载文件或 encrypted-object 引用。

`t5-followon-photo-container-storage.mjs` 在当前生产 API 容器内使用其真实 `FILE_STORAGE_LOCAL_ROOT` 和既有文件卷。写入只创建本操作的新目录，核验每个图片的内容散列，拒绝覆盖；失败或授权回滚只移除核验一致的所属目录。数据库 COMMIT 结果不明时不重试，也不删除可能已经被提交记录引用的图片。

`execute-production-t5-followon.mjs --config <0600 私有文件> --sha256 <配置散列> --mode prepare|execute|rollback` 是受控入口。配置包括 binding、authorization、完整 stage、sourceKey、photoBundle、runtimeEvidence、databaseBinding 和 postgresCredentials 的私有描述符。prepare 只读；execute 在连接真实目标、验证精确源码/合并/运行版本、当前操作者、签名、源字节及生产密钥后建立不可复用的执行 claim。`t5-followon-runtime-keyring.mjs` 调用运行 API 的真实 keyring 解析器和敏感值服务，私下验证 canary 解密及独立 HMAC，密钥仅留在主机内存，不修改任何生产密钥，也不把它们传回操作端。

针对性检查：`node --test scripts/e2e/yuzhou-t5-followon-binding.mjs scripts/e2e/yuzhou-t5-followon-core-owners.mjs scripts/e2e/yuzhou-t5-followon-core-owners-postgres.mjs scripts/e2e/yuzhou-t5-followon-schema-postgres.mjs scripts/e2e/yuzhou-t5-photo-storage.mjs`。最后一项直接运行将用于 API 容器的同一存储程序，检查写入、真实字节回读、重复拒绝、内容漂移拒绝、路径范围和既有文件保护。运行本地验证不表示生产已经写入；全量本地语料验证使用私有数据与合成父操作、合成目标密钥，证据不得进入 Git。
