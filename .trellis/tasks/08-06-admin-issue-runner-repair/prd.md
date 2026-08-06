# 管理员问题反馈与 Runner 修复闭环

## Goal

让金湖 Smart Park 登录用户在任意管理页面直接反馈问题，并让管理员批准的问题通过 Studio 统一自主开发链路进入 Runner 修复、验证、发布和结果回写。

## Confirmed facts

- Phoenix ERP 已有问题证据采集、管理员审批、Runner 消费、结果回写、CI 等待和发布验证能力。
- Smart Park 是独立受管项目，不能复制 Phoenix 的业务表、部署命令或新建第二套 Planner、Scheduler、Worker、Queue。
- Smart Park 当前主工作树存在另一项巡检任务的未提交改动，本任务在隔离工作树实施。
- Smart Park 已有 JWT、租户/园区 Scope、权限守卫、幂等拦截器、文件服务、审计拦截器和生产发布门禁。

## Requirements

1. 所有已登录用户均可从全局界面打开问题反馈入口，提交标题、描述、严重程度、当前路由、URL 和客户端上下文。
2. 提报记录必须按租户/园区隔离，提报人可查看自己的问题和处理进度。
3. 管理员可查看、分类、补充验收标准并批准进入 Runner 修复。
4. Runner 只消费已批准记录；领取和结果回写必须具备权限、幂等和租约/版本保护。
5. Runner 结果包含实现提交、变更文件、验证证据、CI/发布证据和生产检查；缺少证据不得标记完成。
6. Smart Park 只暴露问题与执行投影，实际规划、调度和 Runtime 继续复用 Studio 控制面。
7. 发布必须使用 Smart Park 自己的 CI/CD、健康检查、清理和回滚规则。

## Acceptance criteria

- 登录后任意 Dashboard 页面可见“反馈问题”入口，桌面和 390px 手机可用。
- 创建接口拒绝空标题、超长文本、非法严重程度和越权 Scope，重复请求可安全重放。
- 普通用户只能读取自己提交的问题；管理权限可读取当前 Scope 全部问题。
- 未批准问题不会出现在 Runner 拉取结果中；并发领取最多一个成功。
- 无实现提交或验证/发布证据的 Runner 回写不能进入 `VERIFIED`/`RELEASED`。
- API/Web 类型检查、构建、目标测试和迁移静态检查通过。

## Out of scope

- 不复制 Phoenix 的数据库结构、A1-A4 专属任务模型或部署脚本。
- 不绕过 Studio Activation Gate、Smart Park CI 或生产审批策略。
- 本任务不修改现有工程巡检功能。
