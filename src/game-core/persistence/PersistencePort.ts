/** Domain intents use runtime content IDs; the HTTP adapter resolves owned instance IDs. */
export type PersistentIntent = { type: string; [key: string]: unknown };
export type PersistentReceipt = { resourceId: string | null; transactionId: string | null; sequence: string | null;
  amountCentavos: string; balanceCentavos: string; details: Record<string, string | number | boolean | null> };
export interface PersistencePort {
  execute(action: PersistentIntent): Promise<PersistentReceipt>;
}
