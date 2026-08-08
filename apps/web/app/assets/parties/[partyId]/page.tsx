import { PartyDetailClient } from "../PartyDetailClient";

export default async function PartyDetailPage({
  params
}: {
  params: Promise<{ partyId: string }>;
}) {
  const { partyId } = await params;
  return <PartyDetailClient partyId={partyId} />;
}
