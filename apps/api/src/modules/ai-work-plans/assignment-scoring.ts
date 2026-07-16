import type { ParsedWorkPlanTask, ScoredWorkforceCandidate, WorkforceCandidate } from "./domain/ai-work-plan.types";

const CAPABILITY_TERMS: Array<[RegExp, string[]]> = [
  [/(消防|安全|巡检|隐患)/, ["SAFETY", "安全", "消防", "巡检"]],
  [/(工程|维修|设备|水电|配电)/, ["ENGINEER", "MAINTENANCE", "工程", "维修", "设备"]],
  [/(物业|保洁|绿化|停车)/, ["PROPERTY", "物业", "保洁", "绿化", "停车"]],
  [/(财务|付款|预算|结算)/, ["FINANCE", "财务", "预算", "结算"]],
  [/(招商|租赁|客户)/, ["INVEST", "LEASING", "招商", "租赁"]],
  [/(信息|网络|系统|数字化|IoT|监控)/i, ["IOT", "IT", "信息", "数字", "网络"]]
];

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[\s_\-/]/g, "");
}
export function scoreWorkforceCandidates(
  task: ParsedWorkPlanTask,
  candidates: WorkforceCandidate[]
): ScoredWorkforceCandidate[] {
  const taskText = normalize(`${task.title} ${task.description}`);
  return candidates
    .map((candidate) => {
      let score = 10;
      const reasons = ["当前园区有效用户"];
      const identity = normalize(`${candidate.displayName} ${candidate.username}`);
      const org = normalize(candidate.orgName);
      const roles = normalize(`${candidate.roleCodes.join(" ")} ${candidate.roleNames.join(" ")} ${candidate.postName ?? ""}`);
      if (task.personHint && identity.includes(normalize(task.personHint))) {
        score += 100;
        reasons.push("指令明确指定人员");
      }
      if (task.departmentHint && (org.includes(normalize(task.departmentHint)) || normalize(task.departmentHint).includes(org))) {
        score += 42;
        reasons.push("主责部门匹配");
      }
      if (task.roleHint && roles.includes(normalize(task.roleHint))) {
        score += 32;
        reasons.push("岗位角色匹配");
      }
      for (const [pattern, terms] of CAPABILITY_TERMS) {
        if (pattern.test(taskText) && terms.some((term) => roles.includes(normalize(term)) || org.includes(normalize(term)))) {
          score += 24;
          reasons.push("业务能力匹配");
          break;
        }
      }
      const workloadBonus = Math.max(0, 20 - candidate.activeWorkload * 3);
      score += workloadBonus;
      reasons.push(`当前在办 ${candidate.activeWorkload} 项`);
      return {
        ...candidate,
        score,
        confidence: Math.min(1, score / 120),
        reasons
      };
    })
    .sort((a, b) => b.score - a.score || a.activeWorkload - b.activeWorkload || a.displayName.localeCompare(b.displayName, "zh-CN"));
}

export function shouldAutoSelect(candidates: ScoredWorkforceCandidate[]): boolean {
  const first = candidates[0];
  if (!first || first.confidence < 0.55) return false;
  const second = candidates[1];
  return !second || first.score - second.score >= 8 || first.reasons.includes("指令明确指定人员");
}
