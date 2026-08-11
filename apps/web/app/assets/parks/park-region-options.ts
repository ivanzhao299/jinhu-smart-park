import regionCatalogSource from "./china-regions.json";

type RegionCatalog = Record<string, Record<string, string[]>>;

export interface RegionOption {
  value: string;
  label: string;
  legacy: boolean;
}

const regionCatalog = regionCatalogSource as RegionCatalog;

function toOptions(values: string[], currentValue = ""): RegionOption[] {
  const options = values.map((value) => ({ value, label: value, legacy: false }));
  if (currentValue && !values.includes(currentValue)) {
    options.unshift({ value: currentValue, label: `${currentValue}（历史值）`, legacy: true });
  }
  return options;
}

export function getProvinceOptions(currentProvince = ""): RegionOption[] {
  return toOptions(Object.keys(regionCatalog), currentProvince);
}

export function getCityOptions(province: string, currentCity = ""): RegionOption[] {
  return toOptions(Object.keys(regionCatalog[province] ?? {}), currentCity);
}

export function getDistrictOptions(province: string, city: string, currentDistrict = ""): RegionOption[] {
  return toOptions(regionCatalog[province]?.[city] ?? [], currentDistrict);
}
