import regionCatalogSource from "./china-regions.json";

type RegionCatalog = Record<string, Record<string, string[]>>;

export interface RegionOption {
  value: string;
  label: string;
  legacy: boolean;
}

const additionalProvinceLevelRegions: RegionCatalog = {
  台湾省: {},
  香港特别行政区: {
    香港特别行政区: [
      "中西区", "湾仔区", "东区", "南区", "油尖旺区", "深水埗区", "九龙城区", "黄大仙区", "观塘区",
      "荃湾区", "屯门区", "元朗区", "北区", "大埔区", "西贡区", "沙田区", "葵青区", "离岛区"
    ]
  },
  澳门特别行政区: {
    澳门特别行政区: [
      "花地玛堂区", "花王堂区", "望德堂区", "大堂区", "风顺堂区", "嘉模堂区", "路凼填海区", "圣方济各堂区"
    ]
  }
};

const regionCatalog: RegionCatalog = {
  ...(regionCatalogSource as RegionCatalog),
  ...additionalProvinceLevelRegions
};

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
