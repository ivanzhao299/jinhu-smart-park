import { HousingPurchaseDetailClient } from "../../_components/HousingDetailClients";

export default async function HousingPurchaseDetailPage({
  params
}: {
  params: Promise<{ purchaseId: string }>;
}) {
  const { purchaseId } = await params;
  return <HousingPurchaseDetailClient purchaseId={purchaseId} />;
}
