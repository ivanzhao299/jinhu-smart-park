import { HousingHandoverDetailClient } from "../../_components/HousingDetailClients";

export default async function HousingHandoverDetailPage({
  params
}: {
  params: Promise<{ handoverId: string }>;
}) {
  const { handoverId } = await params;
  return <HousingHandoverDetailClient handoverId={handoverId} />;
}
