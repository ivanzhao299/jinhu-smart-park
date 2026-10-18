# 执行合同

1. Python标准库助手固定CLI plan|apply、预期plan SHA、已验证部署根目录；没有任意源/目标/命令参数。生产仅固定路径，测试通过内部函数注入临时根目录，CLI不开放覆盖。固定校验器先核SHA再import，脚本bytepin不随意替换。
2. plan严格读取<=256直属恢复包及有限JSON，按可信copiedAt及目录mtime保护最新2份/7天；du -P -x -s -k限时获取真实占用，选择最旧候选。plan digest绑定所选basename、元数据hash/stat、实际设备、固定路径、保护和目标。输出只计数/大小/hash，无业务行/文件列表/原始错误；无需创建目录或锁文件。
3. apply重新核实/绑定plan，独立数据盘必须已挂载且不同设备，目标及父路径无symlink、私有0700，校验剩余空间>=选择字节+10GiB。单独非阻塞flock，仅一个归档写者；私有0600持久操作日志，原子写+fsync。不能启动Docker/DB/mount/改系统配置。
4. 每包：确定全部文件为常规、无symlink/特殊项/多硬链接；安全复制完整树至私有staging；完整文件路径/大小/SHA清单核对源与目标；调用审核过的verify_bundle在目标做真实数据库/媒体校验并核对原receipt。检查源全树未漂移、保护集合仍有效，并检查/proc候选文件的dev+ino活动句柄；检查不完整不能当无活动。
5. 在任何原盘回收前，目标复制/校验完成且恢复索引持久化。以原子rename把精确源身份移入固定本地退休staging，再复核并只删除该受控staging；若状态不确定保留原件/副本并报告，不能把后来同名新目录当旧源删除。老副本原路径移入归档索引，新路径是实际恢复地址；最近备份原路径保持。原备份生产器继续现状，不安装symlink、不改它的源码/目的地，不停止服务。
6. journal按plan digest复用，逐包PLANNED/COPIED/VERIFIED/RETIRED；已有目标无匹配日志拒绝覆盖；重放必须重新验证实际目标、已移走源的确切记录和新源身份，跳过的对象也要真实取证。不把失败/中断说成功。日志保存失败阶段和固定码，无路径/凭据。
7. workflow新增archive-smart-control-backups模式+plan/apply选择+expected_plan_sha256，默认plan。分类ops-only，仅显式归档步骤可执行助手；所有secret-helper/source/migration/seed/release-marker/Deploy/UAT步骤均排除。现有diagnostics绝不调用助手。上传脱敏聚合回执，不暴露私有索引。用SSH stdin直接送Python代码，不复制脚本进部署源。
8. 分支只用于运维动作，完成空间恢复后不部署该分支；freshfetch评估主分支重叠，合并已绿PR1003并一次full部署最新main。旧e5成功验证不能代替新Web变更验证。

## 高风险设计审查落实（已审查生产器行为）
- 发布包生产器仅验证已有release-*并复用，新包先写.incoming后发布，不修改已发布正文。其精确已审查字节与现场工具SHA一致。归档flock只串行本助手，不冒充对其他生产器/恢复器的全局锁。
- 副本文件逐个fsync、目录自底向上fsync、目标发布父目录fsync完成后，才能持久VERIFIED和索引，再移动源；不把journal持久性等同于备份落盘。
- 根盘回收选择用du块占用；目标可用量及40GiB上限必须用所有常规文件逻辑大小（元数据遍历有深度/条目界限），不能用du替代，稀疏文件膨胀须被预算拒绝。
- plan不用执行verifier且无远端目录/锁/缓存写入。CLI以python3 -B运行并设置dont_write_bytecode；apply读工具字节一次核hash，再exec该精确字节，禁止hash后另一次不受约束importlib打开。
- 0700仅施加在自建归档/staging/index目录；共享/srv、已挂载根等祖先仅检查归属和非组/他人写，不chmod。
- copiedAt与目录mtime都至少7天才可候选，两者相差超过5分钟或存在未来异常/非法时间一律保留；按copiedAt排序，保护最新两份的时间并列集合（可能多于2份），apply再次检查保护集合。
- source在目标完整验证、索引落盘后，以精确目录dev+ino原子rename到固定.archive-retiring-<plan>-<index>，先持久RETIRE_INTENT，再执行rename并记录RENAMED。rename后重新核树及FD/cwd等候选活动观察。生产器未来只使用原release-*名称，新同名对象独立保护；不宣称绝无未来无关root进程。
- rename后若有活动/漂移/检查不完整，保留退休源和目标；仅当原名不存在且仍为精确旧目录可回滚rename，绝不能覆盖新同名原路径。所有已归档内容仍可按私有索引恢复；近期路径不变。
- resume必须加载原封存plan/journal，逐包协调精确source/retirement/target身份，不能重新选包；预算只计算尚未复制内容。递归删除前持久PURGE_INTENT与完整期待清单，kill后必须先完整验证目的副本，再证明退休树仅是原清单的剩余子集，才可继续；陌生条目或身份漂移停止。测试覆盖rename前后、删除中途、重复执行、新原名和journal篡改。

- 实际已有健康助手为scripts/prod-healthcheck.sh，MODE=full，stdin DEVNULL并设置子进程总时限、捕获脱敏输出；除了exit0，须确认API liveness/API readiness/WEB login三项OK，避免长驻配置将MODE覆盖后误把单项检查当全健康。plan不调用。

- apply为实际大体积复制和完整校验设置独立90分钟作业上限，其余操作30分钟不变；首轮生产吞吐未知，不承诺快速完成。中断按同一plan/journal续做，不重新规划或无条件重跑。小型夹具只证明语义，不证明生产耗时。

## Final review contracts
- Reused complete staging files must be identity-checked and fsynced before COPIED; a matching hash alone is insufficient after interruption.
- Compare every typed verifier evidence field against the original receipt, including database/media hashes, counts, bytes and source revision.
- Target verification may be reused only inside one apply process after a fresh exact full-tree snapshot; normalize only the known root rename ctime. Every new process/resume starts with an empty cache. Source and retirement checks remain complete.
