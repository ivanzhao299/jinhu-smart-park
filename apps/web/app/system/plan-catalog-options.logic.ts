export interface CandidatePage<T> {
  items: T[];
  total: number;
}

export async function collectAllCandidatePages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<CandidatePage<T>>,
  keyOf: (item: T) => string,
  pageSize = 100
): Promise<T[]> {
  const byKey = new Map<string, T>();
  let page = 1;
  let fetchedCount = 0;
  let total = 0;

  do {
    const response = await fetchPage(page, pageSize);
    total = response.total;
    fetchedCount += response.items.length;
    for (const item of response.items) {
      const key = keyOf(item);
      if (key && !byKey.has(key)) byKey.set(key, item);
    }
    if (response.items.length === 0) break;
    page += 1;
  } while (fetchedCount < total);

  return [...byKey.values()];
}

export function isRetainedCatalogValue(candidateValues: string[], currentValue: string | null | undefined): currentValue is string {
  return Boolean(currentValue) && !candidateValues.includes(currentValue!);
}

function normalizedCodes(codes: string[]): string[] {
  return [...new Set(codes.map((code) => code.trim()).filter(Boolean))].sort();
}

export interface PlanAuthorizationOption {
  planCode: string;
  moduleCodes: string[];
  maxUsers?: number;
  maxParks?: number;
}

export function findPlanAuthorization<T extends PlanAuthorizationOption>(plans: T[], planCode: string): T | null {
  return plans.find((plan) => plan.planCode === planCode) ?? null;
}

export function provisionablePlans<T extends PlanAuthorizationOption>(plans: T[]): T[] {
  return plans.filter((plan) => normalizedCodes(plan.moduleCodes).length > 0);
}

export function moduleCodesForSelectedPlan<T extends PlanAuthorizationOption>(
  plans: T[],
  selectedPlanCode: string,
  retainedPlanCode: string | null | undefined,
  retainedModuleCodes: string[]
): string[] | null {
  const plan = findPlanAuthorization(plans, selectedPlanCode);
  if (plan) return plan.moduleCodes;
  return selectedPlanCode === retainedPlanCode ? retainedModuleCodes : null;
}

export function changedPlanAuthorization(
  currentPlanCode: string | null,
  currentModuleCodes: string[],
  nextPlanCode: string | null,
  nextModuleCodes: string[]
): { planCode?: string | null; moduleCodes?: string[] } {
  const currentCodes = normalizedCodes(currentModuleCodes);
  const nextCodes = normalizedCodes(nextModuleCodes);
  const planChanged = currentPlanCode !== nextPlanCode;
  const modulesChanged = currentCodes.length !== nextCodes.length
    || currentCodes.some((code, index) => code !== nextCodes[index]);

  return {
    ...(planChanged ? { planCode: nextPlanCode } : {}),
    ...(modulesChanged ? { moduleCodes: nextCodes } : {})
  };
}
