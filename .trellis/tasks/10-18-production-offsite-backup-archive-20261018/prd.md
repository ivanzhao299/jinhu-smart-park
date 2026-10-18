# 历史发布恢复包转存及HR发布恢复

## 目标与授权
用户已要求低成本清理无用占用、借用大盘解除阻断并持续部署最新HR改动。此次只把已确认的旧发布恢复副本转存至同机独立数据盘，备份内容全部保留、近期原位置副本保留，不触碰SmartControl/KingTurf运行服务、业务数据、配置或登录。若必须停服务、修改其他系统功能或丢弃未经校验备份则不属于本任务授权。

## 当前证据
- 39094095488只读生产结果：/var/backups/smart-control共15个release恢复包，10个至少7天；incoming/其他/符号链接均0；15份release.json/offsite-receipt.json小元数据全部匹配。该结果不代表正文可恢复或无活动读取者。
- 独立数据盘/srv/jinhu-production-data可用87436364KiB，设备不同于根盘。SmartControl备份约70GiB占用是系统盘大头；普通HR源码/回滚很小。
- 固定生产校验器/usr/local/sbin/smart-control-offsite-release-backup.py SHA256=283c03b16d78afc856d2ba39c331ee2b953e77f015c4a580774a3e380860bc3a，与已审查源码相同。
- 最新main=e5f7bc789b38ba6bf6319f7b5283d48598fd9d4d；部署39090915888已失败，无活动部署。PR1003候选91679e203e6bbf7fd379915dbe055eb47e3f0663、CI39091738167全部所需检查通过。

## 范围
独立默认plan、显式apply的固定路径转存助手及聚焦测试，现有生产workflow新增明确archive操作模式（不混入任何diagnose模式），count-only回执和恢复位置索引。审计/归档分支绝不作为应用部署源。恢复空间后freshsync合并PR1003，一次full部署最新main，完成真实运行版本及健康后清理取证。

## 验收
- 仅固定源/var/backups/smart-control下release-*，至少7天，保留最新2份及所有近期/未知/incoming内容。目标/srv/jinhu-production-data/smart-control-release-archive；设备分离、权限私有、空间预留。
- plan不写生产任何文件、不修改业务DB、不读取凭据；回执仅计数/大小/状态/hash，源文件名只留私有操作索引。apply必须绑定plan digest和审核过的固定校验器。
- 根据实际du块占用选最旧候选，力求释放约28至32GiB、传输上限40GiB；不为凑数触碰保护集合，候选不足明确报告。执行后观察实际可用空间，不把估算当证明。
- 复制完整内容到私有临时目标，逐文件SHA256核对和原校验器实际验证SQLite完整性/媒体清单；源在校验结束前保持，失败不删源。不能只比较两份JSON。
- 源任何漂移/符号链接/特殊文件/硬链接/活动候选文件句柄/权限不明/路径或目标冲突→停止退休；保护新产生的目录，不能删除名字相同但身份不同的新内容。只回收已验证目标对应的原盘副本，内容一直可恢复。
- 单写者锁、私有持久索引和每包进度；中断后可按同一plan安全续做，不重复覆盖、不重新选错误范围，不留下假成功。拒绝在任何只读路由触发apply。
- 真实文件/SQLite小夹具覆盖成功、plan零写、候选/门限、保护集合、错误及漂移、目标冲突、复制/校验失败、中断恢复、重复执行、活动句柄、日志脱敏。SSH/Python stdin实际传输受测。备份工具测试fixture使用已审查源码精确字节并锁hash。
- 完成归档后才能full部署；生产验收包括实际API/Web SHA、health/ready/login及最后健康后的Docker清理。工资仍为2026-07全部账套、吴恩国、只算不发。完整现代化目标保持active。
