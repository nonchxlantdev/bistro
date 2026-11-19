export type OrderType = "DINE_IN" | "TAKEAWAY";
export type OrderStatus = "OPEN" | "COMPLETED" | "CANCELLED";
export type TableStatus = "AVAILABLE" | "OCCUPIED" | "RESERVED";

export type CategoryDto = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export type ProductDto = {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryActive: boolean;
  name: string;
  description: string;
  priceCents: number;
  imagePath: string | null;
  imageThumbnailPath?: string | null;
  isActive: boolean;
  modifierGroups?: Array<{ id: string; name: string; minSelect: number; maxSelect: number; options: Array<{ id: string; name: string; priceDeltaCents: number }> }>;
};

export type OrderItemDto = {
  id: string;
  productId: string | null;
  name: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  instructions: string;
  modifiers: Array<{ optionId: string | null; groupName: string; optionName: string; priceDeltaCents: number }>;
};

export type OrderDto = {
  id: string;
  orderNumber: string;
  orderType: OrderType;
  status: OrderStatus;
  kitchenServed: boolean;
  lockedItemIds: string[];
  additionItemIds: string[];
  tableId: string | null;
  tableName: string | null;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  version: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  items: OrderItemDto[];
  payment: null | {
    method: string;
    amountCents: number;
    tenderedCents: number;
    changeCents: number;
    idempotencyKey: string;
    createdAt: string;
  };
  guestPayments: Array<{ guestName: string; amountCents: number; tenderedCents: number; changeCents: number; createdAt: string }>;
};

export type TableDto = {
  id: string;
  name: string;
  capacity: number;
  sortOrder: number;
  isReserved: boolean;
  status: TableStatus;
  order: null | {
    id: string;
    orderNumber: string;
    totalCents: number;
    guestCount: number;
    paidCents: number;
    balanceCents: number;
    openedAt: string;
  };
};

export type SettingsDto = {
  businessName: string;
  locationName: string;
  locationAddress: string | null;
  currency: string;
  receiptFooter: string;
  version: string;
};

export type DashboardDto = {
  activeKitchenTickets: number;
  awaitingPaymentCents: number;
  recentOrders: Array<{ id: string; orderNumber: string; status: string; totalCents: number; createdAt: string; tableName: string }>;
  businessName: string;
  locationName: string;
  currency: string;
  openOrders: number;
  occupiedTables: number;
  tableCount: number;
  completedToday: number;
  salesCents: number;
};

export type CatalogDto = {
  categories: CategoryDto[];
  products: ProductDto[];
};
