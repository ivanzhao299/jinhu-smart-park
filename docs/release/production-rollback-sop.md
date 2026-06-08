# JinHu Smart Park 生产回滚 SOP

## 1. 回滚触发条件

以下任一情况出现时，应进入回滚评估：

- `/ready` 持续失败
- 登录失败
- API 大量 5xx
- 文件上传下载失败
- 关键业务流程阻断
- 幂等重复写入
- 数据库 migration 异常
- 业务负责人判定 No-Go

## 2. 回滚原则

- 优先回滚应用镜像
- 不删除数据库 volume
- 不删除 `api-files-data` volume
- 禁止 `docker compose down -v`
- migration 回滚必须人工确认
- 文件数据默认保留

## 3. 回滚前检查

回滚前先确认：

- 当前 API 镜像 tag
- 当前 Web 镜像 tag
- 目标回滚 API 镜像 tag
- 目标回滚 Web 镜像 tag
- 数据库状态
- 文件 volume 状态
- 最近备份位置
- 当前问题现象

| 检查项 | 当前值 | 备注 |
|---|---|---|
| API 当前 tag | `<待填写>` |  |
| Web 当前 tag | `<待填写>` |  |
| 回滚 API tag | `<待填写>` |  |
| 回滚 Web tag | `<待填写>` |  |
| 数据库状态 | `<待填写>` |  |
| 文件 volume 状态 | `<待填写>` |  |
| 最近备份位置 | `<待填写>` |  |
| 问题现象 | `<待填写>` |  |

## 4. 应用镜像回滚步骤

```bash
export API_IMAGE=<ROLLBACK_API_IMAGE_TAG>
export WEB_IMAGE=<ROLLBACK_WEB_IMAGE_TAG>

docker compose -f infra/docker/docker-compose.prod.yml config
docker compose -f infra/docker/docker-compose.prod.yml up -d api web
docker compose -f infra/docker/docker-compose.prod.yml ps
```

如需显式指定环境变量，请由运维在执行前导出，不要在文档中写真实密钥。

## 5. 回滚后验证

回滚后必须验证：

- `/api/v1/health`
- `/api/v1/ready`
- Web `/login`
- `/auth/login`
- `/auth/me`
- 文件下载
- 核心业务页面抽样

建议验证命令：

```bash
curl -i http://127.0.0.1:<API_PORT>/api/v1/health
curl -i http://127.0.0.1:<API_PORT>/api/v1/ready
curl -i http://127.0.0.1:<WEB_PORT>/login
```

## 6. 数据库回滚策略

当前 SQL migration 机制没有完整自动回滚能力。

原则上：

- 不建议自动执行 down migration
- 如 migration 已执行且存在结构性问题，需要人工评估
- 如有备份，可按数据库恢复 SOP 执行
- migration 机制治理属于后续 `P1-2`

## 7. 文件回滚策略

文件 volume 默认不回滚。

如文件误删或损坏：

- 使用文件备份恢复
- 恢复后抽样下载验证

## 8. 回滚结论记录

| 回滚原因 | 执行人 | 回滚目标 tag | 执行时间 | 验证结果 | 最终状态 |
|---|---|---|---|---|---|
| `<待填写>` | `<待填写>` | `<待填写>` | `<待填写>` | `<待填写>` | `<待填写>` |

