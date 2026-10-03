# 玉舟现代社保试算内核

本切片实现 S3 在线社保流程将使用的精确金额内核，尚未接入 API、页面、政策版本存储或确认流程，不能计为社保业务闭环完成。历史表、政策原值、导入回执与工资发布状态均未修改。

规则依据为冻结 bs_insure_compute 源 SHA c48be83c0d90bf16cc2c5e1ede57bffb3ee299e1bea31ad328b858bc8b267f3b 的独立合成 SQLServer 实验：14 算例、336 分项和56汇总通过。新内核的单元测试只证明其所列现代金额规则，不代替整个旧过程等价、SQLServer 中间精度边界或真实业务签署。

输入为一个已选定版本的六险种政策、各险种基数、四类小数费率/固定附加额和明确的公积金汇总开关。调用方必须先解析租户/园区/员工范围、生效期及政策变体，不可将本函数当作授权或政策选择器。六险种沿用已导入政策 kind：oldage/remedy/losework/wound/bear/fund。

使用 BigInt 精确计算基数×已归一化小数费率+固定附加额，每个分项只在加法后舍入到分，再累计。四类 base/employer/employee/supplement 为独立源分项；base 不被改写为 employer+employee。公积金分项总会计算，仅按显式开关控制汇总。费率支持 numeric(18,6)、固定金额 numeric(18,3)、现代基数和结果 numeric(18,2)，超过存储范围拒绝。没有使用工资 DSL 的四位小数中间舍入，因为会丢失六位费率的精度。

现代输入缺少政策、基数、费率、分项或公积金选择均拒绝；仅显式 null 的固定附加额当零。负基数、负费率、负计算结果进入错误而非覆盖旧事实。旧过程的 NULL 分项、缺政策沿用旧分项、LIKE 部门通配符等行为继续保留在历史规则证据中，不在现代接口静默模拟。

验证命令：

- pnpm install --frozen-lockfile --offline --ignore-scripts
- pnpm --filter @jinhu/shared build
- pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-insurance-calculation.spec.ts
- pnpm --filter @jinhu/api typecheck
- pnpm --filter @jinhu/api exec eslint src/modules/hr/hr-insurance-calculation.ts src/modules/hr/hr-insurance-calculation.spec.ts
- git diff --check

实际结果：6/6 聚焦测试、API 类型检查、相关 ESLint、API 构建和 diff 检查通过。首次测试因合成夹具将 nullable 基数推断为 string 而编译失败，补明确领域类型后通过；未绕过类型检查。独立依赖安装成功，不使用其他工作树的 node_modules 链接。版本基线已同步到 PR780 合并主干 b979b0ee2d7bbfd77fc7dcb0859595e5d8dd31f6，后续只有本切片五个文件修改。

测试涵盖六险种/四分项、舍入顺序、微小费率、公积金开关、不变输入/规范排序、缺项拒绝、错误格式与精度、重复险种、超出二进制安全整数的金额及分项/汇总溢出。工作树独立安装依赖，API 的 @jinhu/shared 实际解析到本工作树 packages/shared。

后续必须接入：不可变政策版本与生效期；授权人员/期间输入；预览输入 hash 与持久冻结；确认前版本/范围/并发校验；确认/关账/更正状态与幂等审计；工资输入引用；真实月份双轨与岗位验收。当前跳过数据库、浏览器和生产发布，因为没有持久写入或业务入口。
