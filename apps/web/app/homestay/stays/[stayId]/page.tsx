import { HomestayDetailClient } from "../../_components/HomestayDetailClient";

export default async function HomestayStayDetailPage({
  params
}: {
  params: Promise<{ stayId: string }>;
}) {
  const { stayId } = await params;
  return <HomestayDetailClient entityId={stayId} kind="stay" />;
}
