# B-module-core v1 独立 handoff 最终签署

日期：2026-08-01  
状态：PASS / CLOSED  
Owner：module-dependency-owner  
`open_P0_P1=[]`  
独立复审：架构/合同 GO；QA/迁移/安全 GO；P0/P1/P2 均为 0。

## 唯一 handoff

- Grammar：`b-module-core-v1.grammar`
- Grammar bytes：`1865`
- `B-module-core SHA`：
  `988eb7e5f70bc5e0614e700feaf77ea68d0edc1f1edcb90aa57ab5b4a3b193df`
- Byte grammar：literal `b-module-core-v1<LF>`，随后 14 行仓库根相对 POSIX 路径，
  按 UTF-8 bytes/`LC_ALL=C` 排序；每行
  `path<TAB>bytes<TAB>raw-sha256<LF>`；文件以且仅以一个 LF 结束。
- Owned tree：`apps/api/src/modules/saas-modules/**`，准确 14 文件，生产 13、
  targeted spec 1。

## 消费的权威输入

- `B-contract-v2`：`e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944`
- `B-schema-expand`：`53e568d409420dc6c38a8139a553735083502f05d6aeb2f3e14adcbb95276874`
- `B-high-risk-stopship`：`d30c601729d83155fda96a0686043cd6fcc6f098368775d1ce73aa0983dfa9d8`
- Runtime effect authority raw：`47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf`
- `000189` raw：`f4af3e88776ae16a0903b0a9a6a8453f674a7a8d317bdd56b5455dfc18e114a2`
- 5 个 contract/schema/stopship sidecar 原始 SHA 已进入四阶段冻结并全部复算匹配。

## 正式成功证据

- 唯一 runId：`bmodulecore_formal_20260801e`
- runId digest：`c04a6d01d2559bb9fffb39c000622de1e7f09417f574e375f9a7a8f686db211a`
- Artifact：`b-module-core-gate-bmodulecore_formal_20260801e.json`
  - bytes：`193423`
  - raw SHA：`96998747682e6733abf90ba6cbad88b24896c97018181a5a115483e7b51b7fcf`
- Detached manifest：`b-module-core-gate-bmodulecore_formal_20260801e.manifest.txt`
  - raw SHA：`f6f2b0c5f98c20f9b9b5c0d11e55ee6ec62f54fad3ad37bd15980d1ba2bb12bf`
- Reservation：`.b-module-core-runid-c04a6d01d2559bb9fffb39c000622de1e7f09417f574e375f9a7a8f686db211a.reservation.json`
  - raw SHA：`fbf4973aa45f723f25f1740ed8d7faa1a8e1acd343f6f2ccb384b709f06ca54b`
- 三份证据 mode 均为 `0600`；reservation 永久保留。
- 227 个 signed inputs 在 before-container、after-local、after-pg、after-cleanup
  四阶段完全一致，freeze SHA：
  `6de0e69772f24cb0db6e494543a07eb62e55aad29d8fcac6315c35cf0d6975a1`。

## 质量与行为门禁

- Static gate：13/13 PASS，无 skip/todo。
- Existing module dependency targeted gate：4/4 PASS，无 skip/todo。
- PostgreSQL/Nest/Service gate：5/5 PASS，无 skip/todo。
- API typecheck、API build、目标 ESLint：exit 0；命令输出 SHA 已写入 artifact。
- 质量配置已签入：根 `package.json`、`eslint.config.mjs`、`tsconfig.base.json`、
  API `tsconfig.build.json`、API `nest-cli.json`。
- 覆盖完整 active predicate、租户/园区隔离、superuser 不绕过、advisory lock、
  并发 enable/disable、事务回滚、enabled/status 一致和稳定 409。
- Reviewed bootstrap 应用 183 项；`000175` 按合同 fail-fast，rollback residual
  `0|0|0|0`；未运行生产或开发 seed。
- PostgreSQL 16.14，官方 `postgres:16-alpine` image ID/RepoDigest 已记录。
- Cleanup PASS：正式 run 的精确容器与单一匿名卷均 absent，errors=[]。

## 历史候选处置

- run a：迁移前置 fixture 缺失，FAILED / NON-AUTHORITATIVE。
- run b：测试场景清理范围过窄，FAILED / NON-AUTHORITATIVE。
- run c：行为通过但缺质量命令和上游 sidecar 绑定，RETURNED / NON-AUTHORITATIVE。
- run d：缺 5 个质量配置 signed inputs，RETURNED / NON-AUTHORITATIVE。
- 上述 artifact、manifest、reservation 均保持不可变，不得覆盖或冒充最终 handoff。

## 放行边界

本签署只补齐 B-2b 所需的 `B-module-core SHA`，允许 qa-automation-owner 和
migration-reconcile-owner 启动 B-extension-core fixture/validation。它不代表 B-2b
完成，不释放 B-2c，不授权修改 runtime、Web、shared、migration 或 seed。
