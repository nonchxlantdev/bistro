import { handle } from "@/lib/http";
import { listKitchenTickets } from "@/lib/services/kitchen";
export async function GET() { return handle(() => listKitchenTickets()); }
