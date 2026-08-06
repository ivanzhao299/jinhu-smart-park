# origin/main 与 PR192 coordination 冲突裁决（2026-08-06）

Base：`3608608ad1cb9c1b53c1829f8cd0f9fb33b6f098`。
Source：`cd3e6a1a9f4376a7a1f13651e23e6dbf66ddbb2e`。

| Path | 裁决 | 必跑验证 |
|---|---|---|
| `apps/api/src/modules/files/file-business-access.service.ts` | 同时保留 main 的 floorplan 权限/数据范围/解绑，以及 PR192 的 identity evidence fail-closed 权限、maker/assignment/module/scope/reference 校验；四态 action 映射 floor read/write。 | Files access unit tests；API build |
| `apps/api/src/modules/files/file-business-access.service.spec.ts` | 合并两侧全部 floorplan 与 identity evidence 回归，并为新增 DataScope 构造依赖补 unrestricted mock。 | 目标 spec |
| `apps/api/src/modules/files/files.service.ts` | 同时保留 multipart filename normalization、SHA-256、identity 删除顺序和 floorplan reference detach。 | Files service spec；API build |
| `apps/api/src/modules/files/files.service.spec.ts` | 合并 filename/adapter 与 identity SHA/download/audit 全部测试。 | 目标 spec |
| `apps/api/src/modules/saas-modules/saas-modules.service.ts` | import 合并为 `DataSource + In + EntityManager + Repository`；保留 plan catalog 与 transaction/locking 两套逻辑。 | plan catalog/dependency specs；API build |
| `apps/web/components/files/FileUploader.tsx` | 保留 PR192 offline queue；统一通过 shared FormData builder，custom routes 不再泄漏 `biz_type/biz_id`。 | uploader logic spec；Web typecheck |
| `apps/web/components/files/file-uploader.logic.ts` | builder 接受 Blob + 显式 filename，使 offline recovery 保持原文件名与 `original_name` 契约。 | 新增 Blob filename 回归 |
| `apps/web/app/homestay/_components/HomestayRatesClient.tsx` | Web typecheck 发现非文本冲突：`unknown` body 不能进入结构化 JSON API；按两个实际调用收窄为 `object`。 | Web typecheck |
| `apps/web/app/homestay/homestay-operations.logic.spec.ts` | 维持 PR192 删除；对应旧 logic 已由 `bc2ed7fa` 删除并迁移到 workbench tests，保留会 module-not-found。 | Homestay workbench tests；Web typecheck |
| `.trellis/workspace/emvia/journal-1.md`、`index.md` | 保留 main 的 PR214 5 次记录，再按日期追加 PR192 Track B/C 为 #6/#7；总计 7 次、journal 244 行。 | marker/结构检查 |

所有冲突均由四个独立只读审查代理先核验，主线程再读取 exact conflict code 与项目
file upload/module access specs 后裁决。没有使用批量 `ours`/`theirs` 覆盖。

## Gate 状态

裁决已写入工作树但尚未形成 merge commit。冲突相关 API tests 35/35、Web tests
10/10、API build 和 Web typecheck 已通过。全量 verify、GitHub CI、release-smoke 与
final-SHA formal gates 仍为待执行，不能据此声明集成通过。
