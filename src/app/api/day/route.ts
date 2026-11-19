import { requireStaff } from "@/lib/auth/current-staff";
import { handle, readJson } from "@/lib/http";
import { closeDay, getDayOverview, startDay } from "@/lib/services/business-day";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const GET = () => handle(() => getDayOverview());
export const POST = (request: Request) => handle(async () => {
  const staff = await requireStaff();
  const input = await readJson(request) as { action?: string; floatCents?: unknown; countedCashCents?: unknown; notes?: unknown; confirmOpenOrders?: unknown };
  if (input.action === "start") { await startDay({ floatCents: input.floatCents }, staff.id); return getDayOverview(); }
  if (input.action === "close") return closeDay({ countedCashCents: input.countedCashCents, notes: input.notes, confirmOpenOrders: input.confirmOpenOrders }, staff.id);
  throw new AppError("Unknown action.", 400, "INVALID_ACTION");
});
