import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  HousingBillingQueryDto,
  HousingEnergyMeterCandidateQueryDto,
  HousingFinanceQueryDto,
  HousingHandoverQueryDto,
  HousingLeaseQueryDto,
  HousingPurchaseQueryDto,
  HousingRepairQueryDto,
  HousingTaskQueryDto,
  HousingUnitCandidateQueryDto
} from "./dto/housing.dto";

const queryDtos: ReadonlyArray<[new () => object, string]> = [
  [HousingTaskQueryDto, "dueAt"],
  [HousingHandoverQueryDto, "createTime"],
  [HousingLeaseQueryDto, "startDate"],
  [HousingBillingQueryDto, "startDate"],
  [HousingFinanceQueryDto, "startDate"],
  [HousingRepairQueryDto, "createTime"],
  [HousingPurchaseQueryDto, "purchaseDate"],
  [HousingUnitCandidateQueryDto, "code"],
  [HousingEnergyMeterCandidateQueryDto, "code"]
];

test("all nine housing list contracts reject raw sort columns and invalid order", async () => {
  for (const [Dto, validSort] of queryDtos) {
    const valid = plainToInstance(Dto, {
      sort: validSort,
      order: "desc",
      page: "8",
      page_size: "100"
    });
    assert.deepEqual(await validate(valid), [], Dto.name);
    const invalid = plainToInstance(Dto, {
      sort: "create_time; DROP TABLE biz_unit",
      order: "sideways"
    });
    const errors = await validate(invalid);
    assert.ok(errors.some((error) => error.property === "sort"), `${Dto.name}/sort`);
    assert.ok(errors.some((error) => error.property === "order"), `${Dto.name}/order`);
  }
});
