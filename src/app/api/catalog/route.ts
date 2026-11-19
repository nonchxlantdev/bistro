import { handle } from "@/lib/http";
import { getPosCatalog } from "@/lib/services/catalog";

export const GET = () => handle(() => getPosCatalog());
