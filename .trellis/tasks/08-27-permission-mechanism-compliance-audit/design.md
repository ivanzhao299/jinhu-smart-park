# 权限机制符合性审计设计

## 边界与证据层级

审计只读分析产品实现；产出限于本任务 Trellis 工件和一份 `docs/reviews` 报告。证据优先级为：当前 HEAD 源码/SQL/测试 > 当前文档/spec > Git 历史和已合并 PR/Issue > 会话/UAT 记录。历史材料不能替代当前实现核验。

## 审计模型

1. 从设计源抽取 MEC-*，每条由“声明出处 + 可执行判据”构成。
2. 建立 shared 契约、数据库实例化、API 守卫/服务 scope、菜单/路由/Web 使用的权限码映射。
3. 对 housing_rental、homestay、property 分别检查每个 MEC，并对高风险结论进行局部源码点验。
4. 将差距转化为分级问题；静态无法确认运行时实例数据或交互行为时标注 UAT。
5. 方案保持产品代码零改动，仅描述未来改动面；数据库方案必须区分已成功迁移与 failed-only 可编辑迁移。

## 关键契约

- 分层访问链必须 fail-closed；某层存在配置不代表实际接线。
- module/page/action 三视角要区分“页面入口可见”与“页面所需 API 权限完备”。
- tenant 与 park 是独立 scope 维度；任何权限/role/bundle 数量断言需核对表的租户维度。
- maker、checker、effect executor 权限和主体要分离；审批结果与 effect audit 不可变。
- 上层模块调用 property/asset 共享底座时不得扩大 tenant/park/data/field/file scope。

## 兼容与运行风险

本轮不执行数据库、生产或浏览器 UAT。报告中的迁移建议须包含前驱 hash/version、逐租户 preflight、reconcile 与回滚/停止条件。动态行为只在现有测试或 UAT 证据充分时判为静态确认，否则列为建议 UAT。
