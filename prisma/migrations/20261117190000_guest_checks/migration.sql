-- Additive only: existing orders and legacy payments remain unchanged.
CREATE TABLE "OrderGuest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "seatNumber" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "OrderGuest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OrderGuest_orderId_seatNumber_key" ON "OrderGuest"("orderId", "seatNumber");
CREATE INDEX "OrderGuest_orderId_idx" ON "OrderGuest"("orderId");
CREATE TABLE "GuestItemAllocation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderGuestId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "quantityUnits" INTEGER,
  CONSTRAINT "GuestItemAllocation_orderGuestId_fkey" FOREIGN KEY ("orderGuestId") REFERENCES "OrderGuest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GuestItemAllocation_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GuestItemAllocation_orderGuestId_orderItemId_key" ON "GuestItemAllocation"("orderGuestId", "orderItemId");
CREATE INDEX "GuestItemAllocation_orderItemId_idx" ON "GuestItemAllocation"("orderItemId");
CREATE TABLE "GuestPayment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderGuestId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "tenderedCents" INTEGER NOT NULL,
  "changeCents" INTEGER NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'CASH',
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuestPayment_orderGuestId_fkey" FOREIGN KEY ("orderGuestId") REFERENCES "OrderGuest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GuestPayment_idempotencyKey_key" ON "GuestPayment"("idempotencyKey");
CREATE INDEX "GuestPayment_orderGuestId_idx" ON "GuestPayment"("orderGuestId");
