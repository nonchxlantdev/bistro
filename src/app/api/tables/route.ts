import { handle } from "@/lib/http";
import { listTables } from "@/lib/services/tables";

export const GET = () => handle(() => listTables());
