import { handle } from "@/lib/http";
import { getDashboard } from "@/lib/services/dashboard";

export const GET = () => handle(() => getDashboard());
