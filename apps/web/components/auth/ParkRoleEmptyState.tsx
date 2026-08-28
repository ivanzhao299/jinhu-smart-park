"use client";

import { ArrowLeft, ShieldAlert } from "lucide-react";
import type { ParkRoleRecoverySource } from "../../lib/park-role-recovery";

interface ParkRoleEmptyStateProps {
  recoverySource: ParkRoleRecoverySource | null;
  recovering: boolean;
  error: string;
  onReturn: () => void;
}

export function ParkRoleEmptyState({ recoverySource, recovering, error, onReturn }: ParkRoleEmptyStateProps) {
  return (
    <main className="page-container park-role-empty-page">
      <section className="ds-panel park-role-empty-panel" role="status">
        <span className="park-role-empty-icon" aria-hidden="true"><ShieldAlert size={26} /></span>
        <div className="park-role-empty-copy">
          <p className="park-role-empty-eyebrow">园区角色待配置</p>
          <h1>已获得园区访问权，但尚未配置园区角色</h1>
          <p>当前园区暂时没有可用的业务功能。请联系园区管理员配置角色；管理员可在“系统管理 → 用户管理”中选择目标园区并配置角色。</p>
        </div>
        <div className="ds-action-bar park-role-empty-actions">
          {recoverySource ? (
            <button className="ds-button ds-button-primary" disabled={recovering} type="button" onClick={onReturn}>
              <ArrowLeft size={16} />
              {recovering ? "正在返回…" : `返回原园区：${recoverySource.parkName}`}
            </button>
          ) : null}
          <span className="park-role-empty-hint">也可使用顶部园区选择器切换到其他已授权园区，或退出登录。</span>
        </div>
        {error ? <p className="park-role-empty-error" role="alert">{error}</p> : null}
      </section>
    </main>
  );
}
