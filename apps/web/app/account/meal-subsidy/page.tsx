"use client";

import QRCode from "qrcode";
import { AlertTriangle, RefreshCw, Wallet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ContentCard,
  DataTable,
  EmptyState,
  ErrorState,
  FeedbackNotice,
  LoadingState,
  MetricCard,
  PageHeader,
  PageShell,
  PaginationBar,
  StatusPill
} from "@jinhu/ui";
import { canteenApi } from "../../../lib/canteen-api";
import type { CanteenPage, CanteenWalletMe, CanteenWalletTxn } from "../../../lib/canteen-types";
import { getAccessToken } from "../../../lib/authz";
import styles from "./meal-subsidy.module.css";

const emptyTxns: CanteenPage<CanteenWalletTxn> = { list: [], total: 0, page: 1, pageSize: 20 };

const TXN_TYPE_LABEL: Record<string, { label: string; variant: "success" | "info" | "warning" | "muted" }> = {
  grant: { label: "发放", variant: "success" },
  consume: { label: "消费", variant: "info" },
  expire: { label: "过期", variant: "warning" }
};

export default function AccountMealSubsidyPage() {
  const token = getAccessToken();

  /* 钱包概览（卡片 + 到期日）与用餐码独立加载，互不拖垮 */
  const [wallet, setWallet] = useState<CanteenWalletMe | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletError, setWalletError] = useState("");

  const [codeError, setCodeError] = useState("");
  const [codeReady, setCodeReady] = useState(false);

  /* 明细 */
  const [txns, setTxns] = useState<CanteenPage<CanteenWalletTxn>>(emptyTxns);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [txnError, setTxnError] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const loadWallet = useCallback(async () => {
    setWalletLoading(true);
    setWalletError("");
    try {
      const w = await canteenApi.getMyWallet(token);
      setWallet(w);
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "加载餐补额度失败");
    } finally {
      setWalletLoading(false);
    }
  }, [token]);

  const loadCode = useCallback(async () => {
    setCodeError("");
    setCodeReady(false);
    try {
      const code = await canteenApi.getMyWalletCode(token);
      if (qrCanvasRef.current) {
        await QRCode.toCanvas(qrCanvasRef.current, code.payload || code.code, { width: 220, margin: 1 });
      }
      setCodeReady(true);
    } catch (error) {
      setCodeError(error instanceof Error ? error.message : "加载用餐码失败");
    }
  }, [token]);

  const loadTxns = useCallback(
    async (page = 1) => {
      setLoadingTxns(true);
      setTxnError("");
      try {
        const data = await canteenApi.listMyWalletTxns(page, 20, token);
        setTxns(data ?? emptyTxns);
      } catch (error) {
        setTxnError(error instanceof Error ? error.message : "加载明细失败");
        setTxns(emptyTxns);
      } finally {
        setLoadingTxns(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void loadWallet();
    void loadCode();
    void loadTxns(1);
  }, [loadWallet, loadCode, loadTxns]);

  const filteredTxns = useCallback(() => {
    if (!typeFilter) return txns.list;
    return txns.list.filter((t) => t.type === typeFilter);
  }, [txns, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(txns.total / txns.pageSize));

  return (
    <PageShell className="canteen-wallet-page">
      <PageHeader
        title="我的餐补"
        description="本期园区餐厅餐补额度、已用/已过期与剩余，出示本人用餐码核销，下方为发放与消费明细。"
        actions={
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              void loadWallet();
              void loadCode();
              void loadTxns(txns.page);
            }}
          >
            <RefreshCw size={16} />
            刷新
          </button>
        }
      />

      <section className="dashboard-grid canteen-summary-grid">
        <MetricCard icon={<Wallet size={18} />} label="本期额度(元)" value={wallet ? `¥${wallet.period_grant}` : "—"} />
        <MetricCard icon={<Wallet size={18} />} label="已用(元)" value={wallet ? `¥${wallet.period_consumed}` : "—"} />
        <MetricCard icon={<Wallet size={18} />} label="已过期(元)" value={wallet ? `¥${wallet.period_expired}` : "—"} />
        <MetricCard icon={<Wallet size={18} />} label="本期剩余(元)" value={wallet ? `¥${wallet.period_balance}` : "—"} />
      </section>

      {walletError ? (
        <ErrorState title="餐补额度加载失败" description={walletError} action={<button className="secondary-button" type="button" onClick={() => void loadWallet()}>重试</button>} />
      ) : null}

      <div className={styles.walletGrid}>
        <ContentCard title="出示用餐码" description={wallet ? `账期 ${wallet.period} · 到期 ${wallet.expire_date ?? "—"}` : "本人用餐二维码"}>
          {codeError ? (
            <ErrorState title="用餐码加载失败" description={codeError} action={<button className="secondary-button" type="button" onClick={() => void loadCode()}>重试</button>} />
          ) : (
            <div className={styles.codeBox}>
              <canvas ref={qrCanvasRef} width={220} height={220} />
              {!codeReady ? <p className="muted-text">正在生成用餐码…</p> : <p className="muted-text">向档口收银员出示此码核销餐补</p>}
            </div>
          )}
        </ContentCard>

        <ContentCard title="本期说明" description="餐补规则">
          <ul className={styles.notes}>
            <li>本期额度按账期发放，当月有效，到期未用自动过期。</li>
            <li>用餐时在 POS 出示本码或报工号/手机号，由收银员核销。</li>
            <li>餐补为虚拟额度，不进公司真实收款账户；超额部分需扫码支付。</li>
            <li>到期日：{wallet?.expire_date ?? "—"}（{wallet?.period ?? "—"} 账期）。</li>
          </ul>
        </ContentCard>
      </div>

      <ContentCard
        title="餐补明细"
        description={`共 ${txns.total} 条；金额单位元。`}
        actions={
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="按类型筛选">
            <option value="">全部类型</option>
            <option value="grant">发放</option>
            <option value="consume">消费</option>
            <option value="expire">过期</option>
          </select>
        }
      >
        {txnError ? (
          <ErrorState title="明细加载失败" description={txnError} action={<button className="secondary-button" type="button" onClick={() => void loadTxns(txns.page)}>重试</button>} />
        ) : loadingTxns ? (
          <LoadingState title="正在加载明细" />
        ) : (
          <DataTable className="allow-horizontal-table">
            <thead>
              <tr>
                <th>类型</th>
                <th>金额(元)</th>
                <th>核销后余额</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {filteredTxns().map((t) => {
                const cfg = TXN_TYPE_LABEL[t.type] ?? { label: t.type, variant: "muted" as const };
                return (
                  <tr key={t.id}>
                    <td><StatusPill variant={cfg.variant}>{cfg.label}</StatusPill></td>
                    <td>¥{t.amount}</td>
                    <td>¥{t.balanceAfter}</td>
                    <td>{new Date(t.txnTime).toLocaleString("zh-CN", { hour12: false })}</td>
                  </tr>
                );
              })}
              {filteredTxns().length === 0 ? (
                <tr>
                  <td colSpan={4}><EmptyState compact title="暂无明细" description="发放与消费记录将显示在这里。" /></td>
                </tr>
              ) : null}
            </tbody>
          </DataTable>
        )}
        <PaginationBar page={txns.page} totalPages={totalPages} total={txns.total} onPage={(p) => void loadTxns(p)} />
      </ContentCard>

      {walletLoading && !wallet ? <FeedbackNotice variant="info" icon={<AlertTriangle size={16} />}>正在加载餐补信息…</FeedbackNotice> : null}
    </PageShell>
  );
}
