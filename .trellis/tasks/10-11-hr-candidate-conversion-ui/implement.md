# Execution

1. 单代理在独立工作区实现局部组件和父级互锁/回执/预选；不编辑发布中的A/B工作区。
2. 组件与实际父页交互测试覆盖精确重试、明确拒绝、畸形回执、同步互锁、刷新失败保留、权限与身份切换。相关招聘回归、定向lint/typecheck。
3. 使用实际组件及共享样式、本地合成API在桌面1280与390px浏览器验收，证据不冒充生产数据。
4. 前序954发布证明后刷新main、验证树/必要重测，再提交PR/CI/串行部署和分项运行证明。

CostGuard：单代理、无新依赖，复用测试框架和合成浏览器构建；只做已确认业务缺口，不重放导入。

## Local acceptance
48 interaction/regression tests in6files PASS (conversion8, recruitment selection14, recruitment results14, requisition parent2, documents8, profile parent2); targetedESLint and Webtypecheck PASS. Browser actual parent+conversion+sharedDS using syntheticAPI: desktop1275/1275 and mobile385/385 viewport/scrollwidth; receipt buttons44px. Unknown transport -> exactkey replay -> writecount1; refresh failure retains receipt and preselected employee. Source hashes frozen in private browser/compiled-source-hashes.json; no production rows. Synthetic fixture corrected independent response copies and main-list vs picker read filtering; these were fixture issues, no production behavior changed for them. Existing API contracts reused, no new backend/DB checks required. PR953 runtime proven181d74a6c4cebc6e959f8d40fcd5848647194320; PR954 merged1c64a5169c35e24df9aeb0d5ce18b7eeb53a7f6b and deploying38114740119 through existing48872.
