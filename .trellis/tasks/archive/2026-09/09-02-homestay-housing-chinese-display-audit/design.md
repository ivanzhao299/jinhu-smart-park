# Investigation Design

## Evidence Model

调查以静态代码证据为主，建立“路由/页面 → 用户可见字段 → Web 渲染表达式 → label 资产 → API 返回投影”的链路。每个确认问题分配唯一 HCD 编号，并保留最小 `file:line` 证据。

## Root Cause Classification

- A：API 已给可显示信息或原始枚举有明确中文定义，但前端没有映射。
- B：前端需要关联中文名称，但 API 契约只返回 ID/code，无法可靠展示名称。
- C：仓库已有统一映射或名称字段，当前页面/分支漏用或回退顺序错误。
- D：原始值在现有代码、字典、文档中没有可确认的中文产品定义。

单个问题只记主根因；若链路同时存在多个缺口，在建议修法中记录次要依赖，避免统计重复。

## Audit Boundaries

- 路由发现以 `apps/web/app` 的目录和页面组件为准，并追踪页面引用的 route-local/shared components。
- 入口改名通过菜单、redirect、兼容路由和相关测试反查。
- API 对照覆盖相应 controller/service/DTO/entity/query projection；不通过生产请求或真实数据验证。
- label 资产检索覆盖 `packages/shared`、`apps/web/lib`、feature/shared 和 route-local maps。

## Proposed Fix Architecture

报告将按证据建议：跨 API/Web 的稳定领域枚举与中文标签优先放 `packages/shared`；纯展示、组合文案或 React 相关 helper 留在 `apps/web`；关联实体名称由 API 在列表/详情 projection 中显式返回，Web 采用“名称 → 合法业务编号 → 中文空值占位”的一致回退，不以 UUID/内部 ID 作为正常回显。

本设计仅定义建议，不在本轮落地。

## Operational Boundary

只创建报告分支、Trellis investigation 文件和 docs 报告。评审/CI 通过后使用 GitHub PR 合并；不直接写 main、不部署。
