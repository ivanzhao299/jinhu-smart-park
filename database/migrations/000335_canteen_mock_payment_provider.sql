-- 000335_canteen_mock_payment_provider.sql
-- M1：放行 dev/test/演示用的 mock 支付渠道落库。
-- 真实渠道仍仅 wechat/alipay；mock 仅在 CANTEEN_PAYMENT_DRIVER=mock 时产生，
-- 不写入任何真实商户号/密钥，也不影响生产约束。
BEGIN;

ALTER TABLE biz_canteen_payments
  DROP CONSTRAINT IF EXISTS ck_canteen_payments_provider;

ALTER TABLE biz_canteen_payments
  ADD CONSTRAINT ck_canteen_payments_provider
  CHECK (provider IN ('wechat', 'alipay', 'mock'));

COMMIT;
