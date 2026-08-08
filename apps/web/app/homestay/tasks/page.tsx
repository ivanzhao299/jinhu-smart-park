import { HomestayListClient } from "../_components/HomestayListClient";
import { PropertyRuntimeSlots } from "../../../components/property/PropertyRuntimeSlots";

export default function HomestayTasksPage() {
  return <>
    <HomestayListClient surface="tasks" />
    <PropertyRuntimeSlots approvalSourceTypes={["homestay-booking"]} module="homestay"
      taskSourceTypes={["homestay_turnover"]} />
  </>;
}
