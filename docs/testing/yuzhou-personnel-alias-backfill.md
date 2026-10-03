# 玉舟人员别名回填规划器

`scripts/hr-cutover/legacy-personnel-alias-backfill-plan.mjs` 是无 I/O 的私有规划库：它既不读取生产数据，也没有 CLI、数据库连接或写入器。它唯一允许产生的建议是 `oldaddr -> native_place` 与 `edulevel -> degree` 的空值填充；所有既有非 `null` 值（包括空字符串）保持原样。输入中的来源观察哈希只是元数据，不是实时保管权或生产授权证明。

调用方必须提供匹配的员工、档案和来源稳定身份集合、同一 tenant/park 范围、未删除且所属正确的行，以及 64 位来源/代码/快照/观察哈希。合同固定绑定已审阅的元数据证据：目录 SHA-256 `8e62d0308c14db70192f5b94f8cc775f2e87032d14f5cbeaee238d1d177f5014`、`u_personinfo2003` 过程 SHA-256 `adf140a230a553b28eca6558dcd324e7ac84fa58f821be23dab75af59437017a`、`web_personinfo_SelectCommand` 过程 SHA-256 `4785a80d7bdc5496c7d64d06567f3a51e3c4fd6aef1f7add7b43d3fc65410868`。这些固定值只证明设计引用了特定元数据观察，绝不证明实时来源保管权、当前数据或生产授权。

重复员工/档案/来源身份、同员工多档案、范围外、删除、未归属、集合不完整、NUL、非法 Unicode surrogate、错误类型或超长度来源/目标值都会失败关闭。来源上限遵照旧列 varchar(50)/varchar(24)，目标上限遵照现代列 varchar(128)/varchar(64)，按 Unicode 码点计数且不截断。这些来源码点上限是必要的大小检查，不能证明 SQL Server varchar 的字节编码合法性；真实演练仍需核对来源编码和保管证据。输出固定为 `productionImport: "HOLD"` 和 `authorizationGranted: false`；`privatePatch` 可以含个人字段值，因此不得写入日志、版本库或普通汇总。返回规划及其所有嵌套对象深度冻结，避免在不更新 plan hash 的情况下篡改私有补丁或计数。

规划结果绑定代码、来源观察、快照、范围、合同、员工/档案清单和每行 before hash。记录按来源稳定身份排序，plan hash 对输入顺序稳定。与现代非空值不同的来源字段以 `preservedDifferentFields` 明确报告并原样保留；同一档案中的其他空字段仍可填充。无可填字段但存在不同现代值时标为 `PRESERVED_MODERN_DIFFERENCE`。这只是保留现值的差异记录，不裁决来源矛盾，也不推测应采用哪个值。同值与空来源都不会生成写入建议。要执行任何未来纠正，必须另行获得实时只读保管/范围核验、独立授权、写入器设计和回放对账，不能把本规划结果当成授权。

验证：`node --test scripts/hr-cutover/tests/legacy-personnel-alias-backfill-plan.test.mjs`。
