import { HousingTasksClient } from "../_components/HousingSurfaceClients";
import { PropertyRuntimeSlots } from "../../../components/property/PropertyRuntimeSlots";

export default function HousingTasksPage() {
  return <>
    <HousingTasksClient />
    <PropertyRuntimeSlots approvalSourceTypes={[
      "housing-lease", "housing-handover", "housing-purchase"
    ]} module="housing_rental" taskSourceTypes={[
      "housing_lease", "housing_handover", "housing_billing", "housing_purchase"
    ]} />
  </>;
}
