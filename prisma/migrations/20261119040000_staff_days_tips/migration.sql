-- Staff sign-in, business days (cash float / close-out), payment method, tips and who served.
-- Additive only: existing orders and payments keep their values (cash, no tip, no staff).
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SERVER',
    "pinSalt" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Staff_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Staff_businessId_name_key" ON "Staff"("businessId", "name");
CREATE INDEX "Staff_businessId_active_idx" ON "Staff"("businessId", "active");

CREATE TABLE "BusinessDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedById" TEXT,
    "openingFloatCents" INTEGER NOT NULL,
    "closedAt" DATETIME,
    "closedById" TEXT,
    "countedCashCents" INTEGER,
    "expectedCashCents" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "BusinessDay_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BusinessDay_businessId_closedAt_idx" ON "BusinessDay"("businessId", "closedAt");
CREATE INDEX "BusinessDay_businessId_openedAt_idx" ON "BusinessDay"("businessId", "openedAt");

ALTER TABLE "BusinessSettings" ADD COLUMN "tipsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BusinessSettings" ADD COLUMN "tipPresets" TEXT NOT NULL DEFAULT '5,8,10,15';
ALTER TABLE "BusinessSettings" ADD COLUMN "defaultFloatCents" INTEGER NOT NULL DEFAULT 10000;

ALTER TABLE "Order" ADD COLUMN "openedById" TEXT;
ALTER TABLE "Order" ADD COLUMN "closedById" TEXT;

ALTER TABLE "GuestPayment" ADD COLUMN "tipCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GuestPayment" ADD COLUMN "staffId" TEXT;
ALTER TABLE "GuestPayment" ADD COLUMN "dayId" TEXT;

ALTER TABLE "Payment" ADD COLUMN "tipCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "staffId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "dayId" TEXT;
