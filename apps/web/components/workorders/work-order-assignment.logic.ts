export type WorkOrderAssignmentMode = "assign" | "reassign";

export interface WorkOrderAssignmentFormState {
  assigneeId: string;
  reason: string;
}

interface WorkOrderAssigneeCandidate {
  status?: string;
}

interface WorkOrderAssigneeLabelCandidate {
  id: string;
  username: string;
  displayName?: string;
  realName?: string;
}

export interface WorkOrderAssigneeOption {
  id: string;
  label: string;
  disabled?: boolean;
}

export function isWorkOrderAssigneeSelectionUnavailable(
  options: WorkOrderAssigneeOption[],
  assigneeId: string
): boolean {
  const normalizedId = assigneeId.trim();
  if (!normalizedId) return false;
  const selectedOption = options.find((option) => option.id === normalizedId);
  return !selectedOption || Boolean(selectedOption.disabled);
}

export function filterEnabledWorkOrderAssignees<T extends WorkOrderAssigneeCandidate>(users: T[]): T[] {
  return users.filter((user) => user.status === "enabled");
}

export function resolveWorkOrderAssigneeOptions<T extends WorkOrderAssigneeLabelCandidate>(
  users: T[]
): WorkOrderAssigneeOption[] {
  const uniqueUsers = [...new Map(users.map((user) => [user.id, user])).values()];
  let displayLabels = uniqueUsers.map((user) => resolveWorkOrderAssigneeBaseLabel(user));

  for (let pass = 0; pass <= uniqueUsers.length; pass += 1) {
    displayLabels = displayLabels.map(normalizeWorkOrderAssigneeLabel);
    const labelCounts = new Map<string, number>();
    for (const label of displayLabels) {
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    }
    const collidingLabels = new Set(
      [...labelCounts.entries()].filter(([, count]) => count > 1).map(([label]) => label)
    );

    if (collidingLabels.size === 0) {
      return uniqueUsers.map((user, index) => ({ id: user.id, label: displayLabels[index] ?? "未知用户" }));
    }

    const disambiguatableLabels = new Set(
      [...collidingLabels].filter((label) => {
        const codes = displayLabels.flatMap((candidateLabel, index) => (
          candidateLabel === label
            ? [formatWorkOrderAssigneeCode(uniqueUsers[index]?.username ?? "unknown")]
            : []
        ));
        return new Set(codes).size === codes.length;
      })
    );
    if (disambiguatableLabels.size === 0) break;

    displayLabels = displayLabels.map((label, index) => (
      disambiguatableLabels.has(label)
        ? `${label}（${formatWorkOrderAssigneeCode(uniqueUsers[index]?.username ?? "unknown")}）`
        : label
    ));
  }

  displayLabels = displayLabels.map(normalizeWorkOrderAssigneeLabel);
  const unresolvedCounts = new Map<string, number>();
  for (const label of displayLabels) {
    unresolvedCounts.set(label, (unresolvedCounts.get(label) ?? 0) + 1);
  }
  return uniqueUsers.map((user, index) => {
    const label = displayLabels[index] ?? "未知用户";
    const unresolved = (unresolvedCounts.get(label) ?? 0) > 1;
    return {
      id: user.id,
      label: unresolved ? `${label}（账号信息重复，请联系管理员）` : label,
      ...(unresolved ? { disabled: true } : {})
    };
  });
}

export function getWorkOrderAssignmentError(
  mode: WorkOrderAssignmentMode,
  form: WorkOrderAssignmentFormState
): string | null {
  if (!form.assigneeId.trim()) return "请选择处理人";
  if (mode === "reassign" && !form.reason.trim()) return "改派原因必填";
  return null;
}

export function formatCommittedWorkOrderAssignmentRefreshError(
  successMessage: string,
  error: unknown
): string {
  return `${successMessage}，但列表刷新失败：${error instanceof Error ? error.message : "未知错误"}`;
}

export function buildWorkOrderAssignmentBody(form: WorkOrderAssignmentFormState): {
  assignee_id: string;
  reason?: string;
} {
  const reason = form.reason.trim();
  return {
    assignee_id: form.assigneeId.trim(),
    ...(reason ? { reason } : {})
  };
}

export function buildWorkOrderAssignmentRequest(
  workOrderId: string,
  mode: WorkOrderAssignmentMode,
  form: WorkOrderAssignmentFormState,
  idempotencyKey: string
): {
  path: string;
  idempotencyKey: string;
  body: ReturnType<typeof buildWorkOrderAssignmentBody>;
} {
  return {
    path: `/work-orders/${workOrderId}/${mode}`,
    idempotencyKey,
    body: buildWorkOrderAssignmentBody(form)
  };
}

function resolveWorkOrderAssigneeBaseLabel(user: WorkOrderAssigneeLabelCandidate): string {
  const readableBusinessName = [user.displayName, user.realName]
    .map((value) => normalizeWorkOrderAssigneeLabel(value ?? ""))
    .find((value) => /\p{L}/u.test(value));
  if (readableBusinessName) return readableBusinessName;
  return normalizeWorkOrderAssigneeLabel(user.username) || "未知用户";
}

function normalizeWorkOrderAssigneeLabel(value: string): string {
  return value
    .replace(/\p{Default_Ignorable_Code_Point}/gu, "")
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .trim();
}

function formatWorkOrderAssigneeCode(value: string): string {
  return [...value].map((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint >= 0x21 && codePoint <= 0x7e && character !== "\\") return character;
    return `\\u{${codePoint.toString(16).toUpperCase()}}`;
  }).join("");
}
