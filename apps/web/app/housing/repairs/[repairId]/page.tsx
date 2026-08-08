import { HousingRepairDetailClient } from "../../_components/HousingDetailClients";

export default async function HousingRepairDetailPage({
  params
}: {
  params: Promise<{ repairId: string }>;
}) {
  const { repairId } = await params;
  return <HousingRepairDetailClient repairId={repairId} />;
}
