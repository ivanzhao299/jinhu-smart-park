import assert from "node:assert/strict";
import test from "node:test";
import { extractContract } from "./contract-gate.mjs";

test("controller method body changes do not change the external contract", () => {
  const first = extractContract("controller.ts", "@Controller('x') export class C { @Get(':id') find(@Param('id') id: string): string { return id; } }");
  const second = extractContract("controller.ts", "@Controller('x') export class C { @Get(':id') find(@Param('id') id: string): string { return id.toUpperCase(); } }");
  assert.deepEqual(first, second);
});

test("route and DTO validation changes are visible", () => {
  const first = extractContract("controller.ts", "@Controller('x') export class C { @Get(':id') find(@Param('id') id: string): string { return id; } }");
  const second = extractContract("controller.ts", "@Controller('x') export class C { @Post(':id') find(@Param('id') id: string): string { return id; } }");
  assert.notDeepEqual(first, second);
  const dtoA = extractContract("dto.ts", "export class D { @IsInt() value!: number }");
  const dtoB = extractContract("dto.ts", "export class D { @IsPositive() value!: number }");
  assert.notDeepEqual(dtoA, dtoB);
});
