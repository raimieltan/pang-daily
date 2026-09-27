-- Qualify the wallet revision column to distinguish it from the PL/pgSQL variable.
CREATE OR REPLACE FUNCTION pang_wallet_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE balance bigint; revision bigint; ledger_balance bigint; ledger_sequence bigint;
BEGIN
  SELECT w."balanceCentavos", w."revision" INTO balance, revision FROM "Wallet" AS w WHERE w."playerId" = NEW."playerId";
  SELECT "balanceAfterCentavos", "sequence" INTO ledger_balance, ledger_sequence
    FROM "Transaction" WHERE "playerId" = NEW."playerId" ORDER BY "sequence" DESC LIMIT 1;
  IF balance <> COALESCE(ledger_balance, 0) OR revision <> COALESCE(ledger_sequence, 0) THEN
    RAISE EXCEPTION 'Wallet must match committed ledger balance and sequence' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
