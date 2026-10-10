import type { HrPayrollReconciliationSetup, HrPayrollReconciliationSource } from "../../../lib/hr-api";
import styles from "./payroll.module.css";

export function PayrollInputReadiness({ setup, sourceSelected, frozenSource, attendance, insuranceSelected, canReadAttendance, canReadRules, canReviewReconciliation, onOpenRules, onOpenPolicy }: {
  setup: HrPayrollReconciliationSetup;
  sourceSelected: boolean;
  frozenSource: HrPayrollReconciliationSource | null;
  attendance: HrPayrollReconciliationSetup["attendanceBatches"][number] | undefined;
  insuranceSelected: boolean;
  canReadAttendance: boolean;
  canReadRules: boolean;
  canReviewReconciliation: boolean;
  onOpenRules: () => void;
  onOpenPolicy: () => void;
}) {
  const month = frozenSource?.periodMonth.slice(0, 7);
  const matching = setup.attendanceBatches.filter(batch => !month || batch.periodMonth.slice(0, 7) === month);
  const book = frozenSource ? setup.books.find(item => item.id === frozenSource.bookId) : undefined;
  const candidates = book ? setup.netItems.filter(item => item.bookId === book.id) : [];
  const currentNetItem = book?.policyVersionId && book.netItemVersionId ? candidates.find(item => item.id === book.netItemVersionId) : undefined;
  return <section className={`ds-panel ${styles.inputReadiness}`} aria-labelledby="payroll-input-readiness-heading">
    <h2 id="payroll-input-readiness-heading">核对输入准备</h2>
    <div className="ds-scene-grid">
      <article className={`ds-scene-card ${styles.inputReadinessCard}`}>
        <h3>1. 工资核对来源</h3>
        <p>{sourceSelected ? `已选择${month ? ` ${month} 的冻结来源` : "已发布来源"}。` : "先选择工资核对来源。"}</p>
        {!sourceSelected && !setup.legacyBatches.length && !setup.frozenSources?.length ? <p>尚无可选来源，请由复核人员准备指定账套、月份的核对记录。</p> : null}
      </article>
      <article className={`ds-scene-card ${styles.inputReadinessCard}`}>
        <h3>2. 已关账考勤</h3>
        <p>{attendance ? `已选择 ${attendance.periodMonth.slice(0, 7)} 考勤输入。` : !matching.length ? `${month ? `${month} ` : "当前"}没有已关闭且生效的考勤输入，请先完成考勤月结。` : "请选择与工资来源同月的考勤输入。"}</p>
        {canReadAttendance ? <a className="ds-button" href="/hr/attendance">查看考勤与月结</a> : null}
      </article>
      <article className={`ds-scene-card ${styles.inputReadinessCard}`}>
        <h3>3. 逐人社保来源</h3>
        <p>{insuranceSelected ? "本次人员的社保来源已选择；仍须核对本期规则、人员资料和系统校验后，才可进行模拟。" : "工资来源和同月考勤选好后，逐人选择社保来源。"}</p>
      </article>
      <article className={`ds-scene-card ${styles.inputReadinessCard}`}>
        <h3>4. 账套规则与净额策略</h3>
        {!sourceSelected ? <p>先选择核对来源，再确认相关账套规则。</p> : !frozenSource ? <p>已发布来源可能涉及多个账套，需逐账套确认；这里不推断月份或单一账套。</p> : !book ? <p>冻结来源已锁定账套，但当前列表未显示该账套的规则信息；请到规则复核确认。</p> : currentNetItem ? <p>{`当前策略使用 ${book.netItemName ?? currentNetItem.displayName}（${currentNetItem.itemCode} · V${currentNetItem.versionNo}），容差 ${book.toleranceAmount ?? "未返回"}。仍须确认本期公式和净额规则。`}</p> : book.policyVersionId ? <p>当前列表显示该账套已有策略，但未显示关联项目；请到规则复核确认。</p> : candidates.length ? <p>{`当前列表显示 ${candidates.length} 个该账套的已批准净额候选，尚未显示当前策略。`}</p> : <p>当前列表未显示该账套的已批准净额候选或当前策略；请到规则复核确认。</p>}
        <p className="ds-inline-note">这里仅展示当前列表可见的候选；未显示不代表不存在或未配置。</p>
        {canReadRules ? <button className="secondary-button" type="button" onClick={onOpenRules}>进入规则工作区核对</button> : <p>如需核对公式或账套规则，请联系具备工资规则读取权限的复核人员。</p>}
        {canReviewReconciliation ? <><button className={`secondary-button ${styles.policyAction}`} type="button" onClick={onOpenPolicy}>查看或追加净额核对策略</button><p className={styles.mobilePolicyGuidance}>净额策略维护请在电脑端继续。</p></> : <p>如需调整净额核对策略，请联系具备双轨核对复核权限的人员。</p>}
      </article>
    </div>
    <p className="ds-inline-note">输入准备完成后仍需核对本期工资规则与人员资料；模拟不会发放工资。</p>
  </section>;
}
