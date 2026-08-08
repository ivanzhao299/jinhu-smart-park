import { HomestayDetailClient } from "../../_components/HomestayDetailClient";

export default async function HomestayBookingDetailPage({
  params
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  return <HomestayDetailClient entityId={bookingId} kind="booking" />;
}
