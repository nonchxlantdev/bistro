CREATE TABLE "KitchenTicket" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "orderVersion" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "changesJson" TEXT NOT NULL,
  "snapshotJson" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "KitchenTicket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "KitchenTicket_idempotencyKey_key" ON "KitchenTicket"("idempotencyKey");
CREATE INDEX "KitchenTicket_orderId_createdAt_idx" ON "KitchenTicket"("orderId", "createdAt");
CREATE INDEX "KitchenTicket_status_createdAt_idx" ON "KitchenTicket"("status", "createdAt");
