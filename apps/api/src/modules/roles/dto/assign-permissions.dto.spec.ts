import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validate } from "class-validator";
import { AssignPermissionsDto, ROLE_PERMISSION_ASSIGNMENT_MAX_SIZE } from "./assign-permissions.dto";

function uuidAt(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

describe("AssignPermissionsDto", () => {
  it("accepts the complete current permission catalog above the old 200-item limit", async () => {
    const dto = new AssignPermissionsDto();
    dto.permissionIds = Array.from({ length: 532 }, (_, index) => uuidAt(index));
    assert.deepEqual(await validate(dto), []);
  });

  it("keeps an explicit upper bound for oversized assignment requests", async () => {
    const dto = new AssignPermissionsDto();
    dto.permissionIds = Array.from({ length: ROLE_PERMISSION_ASSIGNMENT_MAX_SIZE + 1 }, (_, index) => uuidAt(index));
    const errors = await validate(dto);
    assert.ok(errors.some((error) => error.property === "permissionIds"));
  });
});
