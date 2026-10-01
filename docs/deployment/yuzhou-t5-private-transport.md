# 玉舟 T5 完整历史私密传输

独立 prepare/execute 通道固定执行版本，使用现有 production SSH secret，传输 AES-GCM 认证加密包。源材料允许真实为空的 0600 JSONL；所有描述符仍需逐文件 SHA256 对账，最多 64 个文件、2GB，解密后才允许读取完整材料。

父观察只读取真正完成的核心和工资操作、保留配置及执行回执，核对 CORE 所有阶段和员工映射、T4 完整 owned state；通过实际 API 编译模块核验当前密钥，密钥只在进程内短暂使用并清零，不输出或保存。审核使用现有范围内启用账号的实际 UUID，追加签名绑定该账号。

prepare 使用只读数据库连接，注入实际 TCP/socket 一致的连接信息，并运行真实完整 T5 CLI；execute 保留 wx 一次认领，不重试任何可能提交的事务。提交后单独核对原始加密记录、独立投影回执、实际员工照片记录和 API 文件卷中的 2150 个物理文件。例外保持隔离，文档缺少源二进制不伪造附件。

这个分支不会部署业务代码。业务发布和导入必须依次等待核心真实成功、工资真实成功、T5 业务 SHA 的实际备份/恢复及运行版本验证。固定 SHA 需跟随最终审核合并后的执行提交重新核验。临时 secret 和草稿 packet release 在 prepare 后由 custodian 删除，失败也必须清理；不能将“提交成功但对账未完成”当作可重放状态。

验证：`node --test scripts/e2e/yuzhou-t5-private-transport-contract.mjs`。当前执行 SHA 为 `70cad0e6ed82a75e7a853c205cf5014a4d95ccfe`，尚未激活生产。
