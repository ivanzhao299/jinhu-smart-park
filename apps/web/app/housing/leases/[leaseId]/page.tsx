import { HousingLeaseDetailClient } from "../../_components/HousingDetailClients";

export default async function HousingLeaseDetailPage({
  params
}: {
  params: Promise<{ leaseId: string }>;
}) {
  const { leaseId } = await params;
  return <HousingLeaseDetailClient leaseId={leaseId} />;
}
