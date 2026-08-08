import { HousingTenantAliasClient } from "../../_components/HousingTenantAliasClient";

export default async function HousingTenantAliasPage({
  params
}: {
  params: Promise<{ partyId: string }>;
}) {
  const { partyId } = await params;
  return <HousingTenantAliasClient partyId={partyId} />;
}
