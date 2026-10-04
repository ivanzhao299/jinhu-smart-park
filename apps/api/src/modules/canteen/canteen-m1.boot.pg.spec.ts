import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { CanteenModule } from "./canteen.module";
import { CanteenCheckoutService } from "./canteen-checkout.service";
import { CanteenPaymentRegistry } from "./payment/canteen-payment-registry";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://jinhu:change_me@127.0.0.1:55432/jinhu_smart_park";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: "postgres",
      url: DATABASE_URL,
      autoLoadEntities: true,
      synchronize: false
    }),
    CanteenModule
  ]
})
class CanteenBootTestModule {}

test("M1: NestFactory application context boots canteen module against canteen-dev-pg", {
  skip: !process.env.DATABASE_URL && !process.env.CANTEEN_PG_TEST
}, async () => {
  const app = await NestFactory.createApplicationContext(CanteenBootTestModule, { logger: false });
  try {
    const checkout = app.get(CanteenCheckoutService);
    const registry = app.get(CanteenPaymentRegistry);
    assert.ok(checkout, "checkout service wired");
    assert.equal(registry.driver, "mock");
    const ds = app.get(DataSource);
    const row = (await ds.query("select 1 as ok")) as Array<{ ok: number }>;
    assert.equal(row[0]!.ok, 1);
  } finally {
    await app.close().catch(() => undefined);
  }
});
