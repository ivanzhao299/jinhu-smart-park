import { useEffect, useState } from "react";
import { loadDictMapByCodes, type DictClientItemRow } from "../../../lib/dict-client";

const HOUSING_DISPLAY_DICT_CODES = ["housing_charge_type", "housing_payment_method"] as const;

export interface HousingDisplayDictionaries {
  chargeTypes: Readonly<Record<string, string>>;
  paymentMethods: Readonly<Record<string, string>>;
}

const EMPTY_DICTIONARIES: HousingDisplayDictionaries = { chargeTypes: {}, paymentMethods: {} };

function labels(items: readonly DictClientItemRow[] | undefined): Readonly<Record<string, string>> {
  return Object.fromEntries((items ?? []).map((item) => [item.itemValue, item.itemLabel]));
}

export function useHousingDisplayDictionaries(invalidationKey: string): HousingDisplayDictionaries {
  const [dictionaries, setDictionaries] = useState<HousingDisplayDictionaries>(EMPTY_DICTIONARIES);
  useEffect(() => {
    let active = true;
    setDictionaries(EMPTY_DICTIONARIES);
    void loadDictMapByCodes(HOUSING_DISPLAY_DICT_CODES).then((result) => {
      if (active) setDictionaries({
        chargeTypes: labels(result.housing_charge_type),
        paymentMethods: labels(result.housing_payment_method)
      });
    }).catch(() => {
      if (active) setDictionaries(EMPTY_DICTIONARIES);
    });
    return () => { active = false; };
  }, [invalidationKey]);
  return dictionaries;
}
