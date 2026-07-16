import type { AiWorkPlanRisk, ParsedWorkPlan, ParsedWorkPlanTask } from "./domain/ai-work-plan.types";

const ACTION_PATTERN = /(完成|制定|编制|检查|巡检|整改|复核|验收|提交|处理|维修|排查|汇总|通知|反馈|跟进|关闭|交付|清理|核对|统计|测试|确认|安装|更换|修复|调查)/;
const DEPARTMENT_PATTERN = /([\u4e00-\u9fa5A-Za-z0-9]{2,20}(?:部|中心|科|组|办公室|公司|单位))/;
const PERSON_PATTERN = /(?:请)?([\u4e00-\u9fa5]{2,4})(?:在[^，,。；;]{0,24})?(?:负责|牵头|执行|完成|随后|复核|验收)/;

const TYPE_RULES: Array<[RegExp, string]> = [
  [/(消防|火灾|灭火|烟感)/, "fire_safety"],
  [/(维修|修复|故障|损坏|更换)/, "repair"],
  [/(保养|维保|设备)/, "maintenance"],
  [/(保洁|清洁|卫生)/, "cleaning"],
  [/(安防|门禁|监控|治安)/, "security"],
  [/(停车|车辆)/, "parking"],
  [/(绿化|园林)/, "landscaping"],
  [/(水电|能耗|电力|配电)/, "energy"],
  [/(咨询|调研)/, "consultation"],
  [/(申请|服务)/, "request"]
];

export class LocalNaturalLanguageWorkPlanner {
  parse(instruction: string, options: { now?: Date; defaultDueAt?: Date | null } = {}): ParsedWorkPlan {
    const normalized = instruction.replace(/\s+/g, " ").trim();
    const now = options.now ?? new Date();
    const defaultDueAt = options.defaultDueAt ?? this.resolveDueAt(normalized, now);
    const clauses = this.extractActionClauses(normalized);
    const leadDepartment = this.extractLeadDepartment(normalized);
    const tasks = clauses.map((clause, index) => this.toTask(clause, normalized, index, now, defaultDueAt));

    if (leadDepartment && tasks[0] && !tasks[0].departmentHint) {
      tasks[0].departmentHint = leadDepartment;
    }
    const supportDepartment = this.extractSupportDepartment(normalized);
    if (supportDepartment && !tasks.some((task) => task.departmentHint === supportDepartment)) {
      tasks.push(this.toTask(`${supportDepartment}配合${tasks[0]?.title ?? normalized}`, normalized, tasks.length, now, defaultDueAt));
    }

    const clarificationQuestions: string[] = [];
    if (!tasks.some((task) => task.dueAt)) clarificationQuestions.push("请确认各项工作的完成期限");
    if (!tasks.some((task) => task.departmentHint || task.personHint)) clarificationQuestions.push("请确认主责部门或责任人");

    return {
      normalizedGoal: this.normalizeGoal(normalized),
      riskLevel: this.resolveRisk(normalized, tasks),
      assumptions: [
        "人员候选仅来自当前园区已启用的组织、岗位和角色",
        "低置信度任务在批准前必须人工确认责任人",
        "批准后才生成真实工单"
      ],
      clarificationQuestions,
      tasks
    };
  }

  private extractActionClauses(instruction: string): string[] {
    const coarse = instruction.split(/[。；;\n]+/).map((item) => item.trim()).filter(Boolean);
    const clauses: string[] = [];
    for (const sentence of coarse) {
      const fragments = sentence.split(/[，,]+/).map((item) => item.trim()).filter(Boolean);
      const actionable = fragments.filter((fragment) => ACTION_PATTERN.test(fragment));
      if (actionable.length > 0) clauses.push(...actionable);
      else if (ACTION_PATTERN.test(sentence)) clauses.push(sentence);
    }
    return [...new Set(clauses.length > 0 ? clauses : [instruction])].slice(0, 20);
  }

  private toTask(
    clause: string,
    instruction: string,
    index: number,
    now: Date,
    defaultDueAt: Date | null
  ): ParsedWorkPlanTask {
    const cleaned = clause.replace(/^(请|需要|要求)/, "").replace(/(由.+?牵头)/, "").trim();
    const departmentHint = this.extractDepartment(clause);
    const roleHint = this.extractRoleHint(clause);
    const personHint = PERSON_PATTERN.exec(clause)?.[1] ?? null;
    const workOrderType = TYPE_RULES.find(([pattern]) => pattern.test(clause))?.[1] ?? "other";
    const urgency = /立即|马上|特急|重大/.test(clause) ? "critical" : /紧急|尽快|24小时/.test(clause) ? "urgent" : "normal";
    const priority = urgency === "critical" || /重大|关键/.test(clause) ? "high" : urgency === "urgent" ? "high" : /日常|例行/.test(clause) ? "low" : "medium";
    const dueAt = this.resolveDueAt(clause, now) ?? defaultDueAt;
    const evidence = /(检查|巡检|整改|维修|验收|复核)/.test(clause) ? ["现场记录", "完成结果照片"] : ["完成结果说明"];
    const title = this.compactTitle(cleaned || clause, index);
    return {
      title,
      description: `${clause}\n\n来源指令：${instruction}`,
      departmentHint,
      roleHint,
      personHint,
      workOrderType,
      priority,
      urgency,
      dueAt,
      acceptanceCriteria: this.acceptanceCriteria(title, clause),
      evidenceRequirements: evidence,
      dependencyIndexes: index === 0 ? [] : this.isSequential(clause) ? [index - 1] : []
    };
  }

  private resolveDueAt(text: string, now: Date): Date | null {
    const iso = /(20\d{2})[-年/](\d{1,2})[-月/](\d{1,2})日?/.exec(text);
    if (iso) return this.endOfDay(new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    if (/今天|今日/.test(text)) return this.endOfDay(now);
    if (/后天/.test(text)) return this.endOfDay(new Date(now.getTime() + 2 * 86_400_000));
    if (/明天|明日/.test(text)) return this.endOfDay(new Date(now.getTime() + 86_400_000));
    const weekday = /(?:本周|下周|周)([一二三四五六日天])/.exec(text);
    if (weekday) {
      const day = "一二三四五六日".indexOf(weekday[1]!.replace("天", "日")) + 1;
      const current = now.getDay() || 7;
      let delta = day - current;
      if (text.includes("下周")) delta += delta <= 0 ? 7 : 7;
      else if (delta < 0) delta += 7;
      return this.endOfDay(new Date(now.getTime() + delta * 86_400_000));
    }
    const hours = /(\d{1,3})\s*小时内/.exec(text);
    if (hours) return new Date(now.getTime() + Number(hours[1]) * 3_600_000);
    return null;
  }

  private extractLeadDepartment(text: string): string | null {
    return /由([^，,。；;\s]{2,20}?(?:部|中心|科|组|办公室|公司|单位))牵头/.exec(text)?.[1] ?? null;
  }

  private extractSupportDepartment(text: string): string | null {
    return /([^，,。；;\s]{2,20}?(?:部|中心|科|组|办公室|公司|单位))配合/.exec(text)?.[1] ?? null;
  }

  private extractDepartment(text: string): string | null {
    return this.extractLeadDepartment(text) ?? this.extractSupportDepartment(text) ?? DEPARTMENT_PATTERN.exec(text)?.[1] ?? null;
  }

  private extractRoleHint(text: string): string | null {
    return /([\u4e00-\u9fa5A-Za-z0-9]{2,20}(?:负责人|经理|主管|工程师|巡检员|管理员|专员))/.exec(text)?.[1] ?? null;
  }

  private normalizeGoal(text: string): string {
    return text.length <= 240 ? text : `${text.slice(0, 237)}...`;
  }

  private compactTitle(text: string, index: number): string {
    const title = text.replace(/[。；;]/g, "").trim();
    return (title || `工作任务 ${index + 1}`).slice(0, 200);
  }

  private acceptanceCriteria(title: string, clause: string): string {
    if (/(检查|巡检)/.test(clause)) return `${title}完成，检查项有结论，异常项有记录和责任人`;
    if (/整改/.test(clause)) return `${title}完成，整改前后证据齐全并通过复核`;
    if (/(复核|验收)/.test(clause)) return `${title}形成明确通过或驳回结论并留痕`;
    return `${title}按要求完成，并提交可核验的结果说明`;
  }

  private resolveRisk(instruction: string, tasks: ParsedWorkPlanTask[]): AiWorkPlanRisk {
    if (/(生产停机|人身伤亡|重大消防|危化品|紧急疏散)/.test(instruction)) return "CRITICAL";
    if (/(生产|消防|重大|安全事故|跨部门)/.test(instruction) || new Set(tasks.map((task) => task.departmentHint).filter(Boolean)).size > 1) return "HIGH";
    return tasks.length > 3 ? "MEDIUM" : "LOW";
  }

  private isSequential(clause: string): boolean {
    return /(然后|之后|完成后|最终|再|复核|验收|关闭)/.test(clause);
  }

  private endOfDay(value: Date): Date {
    const date = new Date(value);
    date.setHours(23, 59, 59, 999);
    return date;
  }
}
