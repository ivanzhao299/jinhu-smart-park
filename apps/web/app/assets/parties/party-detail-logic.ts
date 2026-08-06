import type {
  CanonicalDetailState,
  ReturnContextPolicy
} from "../../../features/property-shared";

export const PARTY_RETURN_POLICY: ReturnContextPolicy = {
  origin: "https://workbench.local",
  fallbackHref: "/assets/parties",
  routes: {
    parties: {
      pathTemplate: "/assets/parties",
      allowedQueryKeys: ["page", "keyword", "party_type", "sort", "order"]
    }
  }
};

export function partyDetailFailureState(input: {
  cached: boolean;
  message: string;
  offline: boolean;
  status?: number;
}): CanonicalDetailState {
  if (input.status === 404) return { kind: "not-found" };
  if (input.status === 403) return { kind: "forbidden" };
  if (input.status === 409) return { kind: "conflict", message: input.message };
  if (input.offline && input.cached) return { kind: "ready", stale: true };
  return { kind: "failure", message: input.message };
}
