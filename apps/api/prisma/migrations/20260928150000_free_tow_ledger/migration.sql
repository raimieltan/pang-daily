-- A trusted mechanic's first tow is recorded without changing the wallet balance.
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_check_1";
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_check_1"
  CHECK ("amountCentavos" <> 0 OR ("kind" = 'TOW_GIFT' AND "source" = 'tow'));
