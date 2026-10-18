# 生产盘真实占用只读审计

## 目标
解除已确认磁盘阻断，完成HR发布。先一次有针对性的只读容量审计，再依据证据处理可确认无用内容或借用已有挂载大盘，不盲目重建、不重导历史数据。

## 证据
main e5f7bc789b38ba6bf6319f7b5283d48598fd9d4d。初始39086313571磁盘耗尽；恢复39090915888完整发布校验PASS，但pre-sync健康检查后清理只回收242.2MB，仍不足1GiB。复制新代码尚未执行。清理后Docker systemdf：4images7.559GB、reclaimable5.432GB；4activecontainers；volumes3.983GB；activebuildcache1.556GB。根盘约98GB已用，容量总览另有84GB空闲挂载空间。仅Docker统计不能说明磁盘实际占用，必须du核实。刚复核health/ready/login均200，保留全部运行容器、镜像和数据卷。

## 范围
仅增强现有scripts/diagnose-yuzhou-hr-production-capacity.sh输出固定标签聚合大小（数字KiB及明确UNAVAILABLE/NOT_PRESENT，不输出文件名、人员行、凭据或环境值）。通过已有diagnose-yuzhou-hr-capacity工作流从审计分支SSH stdin执行；诊断绝不deploy/migrate/seed/transfer/store远程文件。
固定目录建议root树、/var、/srv、/opt、/usr、/root、/home、/tmp、/var/tmp、/var/log；DockerRootDir及其overlay2/buildkit/containers/volumes/tmp；当前HR源码目录、node_modules、apps/web/.next、logs、同级.runner-rollback及已失败39086313571快照；已有固定数据挂载路径的容量/是否同盘（先读mount-production-data-disk.sh确定固定路径）。只计大小，嵌套路径不能相加当独立占用。du不跟随内部符号链接、每路径同设备，限时并错误脱敏，失败不得伪造0。

## 验收
- 现有容量字段、DISK_GUARD/READY语义和所有只读边界保留；不加载.env、无业务SQL。
- 固定label/路径，不接任意查询目录；仅计大小及可用量，禁止raw文件/私密记录/路径列表。
- helper真实执行测试覆盖du成功、失败、缺目录、非法输出、超时/命令不可用；保留失败与缺失区别，不泄露错误路径。
- 既有capacity合同和shell语法通过，审查无写入路径。若rootdu明显小于df_used，再加一个针对open-deleted文件的聚合检查；先别造通用取证引擎。
- root独占生产命令，先将分支只读probe结果作为证据，再决定低成本恢复动作；不修改workflow/业务app/迁移/权限/依赖。
- 审计分支不作为部署候选；原e5恢复发布可在空间恢复后仅重试已失败job，复用成功的完整校验。审批PR1003保持独立冻结。

## 备份归属聚焦阶段
39092981077确认/var/backups为主要占用，独立数据盘约83GiB可用。下一次只读观察仅增加该固定目录的一层类型/大小/年龄统计及固定服务归属分类，和固定cron配置中是否引用该目录的布尔/计数。不输出真实文件名、cron命令、人员、凭据或配置内容。文件名只在内存用于固定模式分类；未知文件保持UNKNOWN，分类不等于可归档授权。不先复制70GB全部备份，不动KingTurf或未知备份；获得HR备份明确归属后单独实施可验证转存。

39093421990表明/var/backups只有一个直属子目录且容纳大部分占用，但所有固定服务路径都不存在、名称分类均OTHER。为避免反复猜路径，允许只读输出该唯一基础设施目录的basename（仅ASCII字母数字点横线下划线、1..80字符；多目录/非法名称/错误则UNAVAILABLE），不输出普通文件名、完整路径、任何正文或凭据。该名称只用于确认后续固定服务路径和备份用途。

## 已确认实际归属
39093637270唯一目录名为smart-control。只读参考本机SmartControl现有发布备份脚本，已确认其默认异机备份目录/var/backups/smart-control、bundle命名release-*、生产校验工具/usr/local/sbin/smart-control-offsite-release-backup.py。不得将其当HR临时垃圾。下一步固定该目录观察发布bundle/未完成incoming数量、有限manifest/receipt有效性、时间和工具hash，并另做明确的共享主机备份转存方案，保留原路径可访问性、近期备份和全部内容；不停止SmartControl/KingTurf服务，不在只读诊断中复制/删除/挂载。
