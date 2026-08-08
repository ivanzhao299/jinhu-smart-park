import { HomestayDetailClient } from "../../_components/HomestayDetailClient";

export default async function HomestayTurnoverDetailPage({
  params
}: {
  params: Promise<{ turnoverId: string }>;
}) {
  const { turnoverId } = await params;
  return <HomestayDetailClient entityId={turnoverId} kind="turnover" />;
}
