# 设计

保留既有CI步骤和pnpm角色回归命令。通过pg_config/PG_BIN检查initdb、pg_ctl、psql可执行性，缺少时才apt安装，网络重试和超时有界；安装后再检查。增加实际工作流shell块的独立命令桩回归。原角色回归源码与生产种子保持原字节。
