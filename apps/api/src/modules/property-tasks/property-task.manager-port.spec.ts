import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntityManager } from "typeorm";
import {
  toPropertyTaskManagerPort,
  TypeOrmPropertyTaskManagerPort
} from "./property-task.manager-port";

describe("C4 property task transaction manager port", () => {
  it("preserves the exact TypeORM transaction manager identity", () => {
    const manager = { marker: "same-transaction" } as unknown as EntityManager;
    const port = toPropertyTaskManagerPort(manager);
    assert.ok(port instanceof TypeOrmPropertyTaskManagerPort);
    assert.equal(port.transactionContext, manager);
  });
});
