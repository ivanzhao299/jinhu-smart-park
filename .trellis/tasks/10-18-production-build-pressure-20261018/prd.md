# 生产构建前磁盘压力回收

## 目标
完成PR1001现代工作汇报部署，解决已取证的生产构建磁盘耗尽；不重导或改写业务数据。

## 证据
main685407b31718d988e217b3f78379072f58396542。部署39086313571在web镜像完成构建后磁盘不足，中止切换；其回滚重建api同样空间不足。外部health/ready/login均200。只读容量39087172753证明host/docker free81052KiB，其他挂载盘合计仍有空间。日志见/Users/mac/.codex/artifacts/hr-work-report-entry-20261018。

## 最小范围
范围：scripts/prod-deploy.sh、必要的聚焦shell回归、部署/测试说明，以及.github/workflows/deploy-production.yml和ci.yml中的聚焦门禁和回归调用。新增scripts/e2e/production-pre-sync-cleanup.contract.mjs执行从workflow抽取的真实SSH shell。现有before-build仅清理buildercache，先构建再执行会堆积未使用image。web/api/full构建前低空间时，应先全服务健康检查，再调用已有prod-docker-cleanup.sh，清理未使用镜像/停止容器/缓存。保留运行容器镜像和全部卷；不新增磁盘迁移、DDL、账户或依赖。由于生产系统盘仅79MiB，必须在Ensure required production secrets的helper传输和rollback快照之前，增加现有健康release的压力清理；诊断模式及非构建模式不触发写入。新镜像构建后的清理仍仅buildercache，绝不能剪掉尚未切换的新镜像。

## 验收
- 健康失败时禁止清理及构建。
- 低空间构建前顺序health→已有cleanup→重读空间→build；足够空间不额外清理。
- 构建后只清builder，不能调用image cleanup。
- 回收失败或空间不足明确失败；原post-deploy health→cleanup仍保留。
- shell语法和聚焦真实脚本stub运行回归；相关既有deploy合同；CI通过。
- 最新合并版本部署成功后health和Docker清理成功，独立runtime镜像观察；真实工资/岗位仍未验收。
