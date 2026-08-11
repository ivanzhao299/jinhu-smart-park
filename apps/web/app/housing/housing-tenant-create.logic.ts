export interface HousingTenantCreateBody {
  party_type: "person";
  display_name: string;
  mobile?: string;
}

export function buildHousingTenantCreateBody(form: FormData): HousingTenantCreateBody {
  return {
    party_type: "person",
    display_name: String(form.get("display_name") ?? ""),
    mobile: String(form.get("mobile") ?? "") || undefined
  };
}
