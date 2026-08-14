import { HousingTasksClient } from "../_components/HousingSurfaceClients";
import { PropertyRuntimeSlots } from "../../../components/property/PropertyRuntimeSlots";
import {
  HOUSING_RUNTIME_APPROVAL_SOURCE_TYPES,
  HOUSING_RUNTIME_TASK_SOURCE_TYPES
} from "../_components/housing-workbench-contract";

export default function HousingTasksPage() {
  return <>
    <HousingTasksClient />
    <PropertyRuntimeSlots approvalSourceTypes={HOUSING_RUNTIME_APPROVAL_SOURCE_TYPES}
      module="housing_rental" taskSourceTypes={HOUSING_RUNTIME_TASK_SOURCE_TYPES} />
  </>;
}
