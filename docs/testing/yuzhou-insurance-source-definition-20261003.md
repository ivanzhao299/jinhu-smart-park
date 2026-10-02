# 历史社保政策完整定义与复制校验

本切片补齐历史政策在现代维护页中的查看链路：原适用范围、六险种四类百分率及固定附加额先显示，再复制为不可变现代定义。历史后缀2字段是固定附加额，不是第二套百分率；现代方案编号是另一个维度。原适用范围仅保留供核对，不自动转成人员适用规则。

`GET /hr/insurance/policies/:id?expected_version=...` 使用现有社保、金额及员工读取权限。父政策和分项在只读一致快照中读取，返回允许字段、明确NULL以及每个可用方案的分项校验值；缺失费率不补零，分项不完整仍能查看但不可复制。必需敏感读取审计失败时不返回定义。

现代页面复制前必须取得完整定义，并提交 `expectedSourceFactorsHash`。保存事务锁定来源后再次比较校验值，拒绝父版本未变但分项变化的情况。成功请求原样重试仍复用已保存UUID；源数据后续变化不会改写已保存定义。旧客户端可以省略新增字段，保持旧请求规范化和重试语义；省略字段的请求不宣称查看到保存之间的分项漂移保护。

## 验证

- 来源定义、现有参考试算、政策创建与来源漂移聚焦单元测试：16项通过。
- 页面交互和API参数传递：13项通过。覆盖NULL显示/禁止复制、源校验值传递、权限上下文撤销/取消迟到响应、稳定重试及GET取消信号。
- 实际组件、共享Design System和权限组件使用合成认证/API完成1280px及390px检查：六险种卡片显示完整，控件无横向溢出；缺失费率提示可见。测试标签页、临时HTTP服务和视口覆盖已清理。
- 完整原迁移至000322后的真实PostgreSQL测试7项通过、0失败、0跳过。覆盖来源读取守恒、原范围/NULL/固定金额、查看后分项变化拒绝、成功请求重试、重新读取后保存及真实读取审计失败；原有不可变、并发、审计回滚和来源锁测试也通过。临时数据库容器已删除，未写生产库。

该切片尚未发布，不代表真实岗位验收、政策激活、期间确认/关账、更正、工资联动或原玉舟全部功能等价。

```sh
pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-insurance-policy-source.spec.ts src/modules/hr/hr-insurance-policy-version.spec.ts src/modules/hr/hr-insurance-preview.spec.ts
pnpm --filter @jinhu/web test:unit:interaction test/interaction/hr-insurance-policies.test.tsx test/interaction/hr-insurance-preview-api.test.tsx
```

真实数据库入口继续使用 `hr-insurance-policy-version.pg.spec.ts`，必须显式设置隔离库、回环地址及两个已有启用变量。普通测试的skip不代表数据库验证通过。
