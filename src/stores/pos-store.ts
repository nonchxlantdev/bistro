"use client";

import { create } from "zustand";
import { addProduct, changeQuantity, clearCart, removeProduct, type CartLine, type CartProduct } from "@/lib/domain/cart";
import type { OrderDto, OrderStatus, OrderType } from "@/types/api";

type PosState = {
  hydrated: boolean;
  orderId: string | null;
  orderNumber: string | null;
  version: number;
  orderType: OrderType;
  tableId: string | null;
  tableName: string | null;
  status: OrderStatus;
  kitchenServed: boolean;
  additionMode: boolean;
  beginAdditions: () => void;
  finishAdditions: () => void;
  discountCents: number;
  lines: CartLine[];
  dirty: boolean;
  loadOrder: (order: OrderDto) => void;
  startNew: (input?: { orderType?: OrderType; tableId?: string | null; tableName?: string | null }) => void;
  add: (product: CartProduct) => void;
  increment: (productId: string) => void;
  decrement: (productId: string) => void;
  remove: (productId: string) => void;
  clear: () => void;
  setOrderType: (orderType: OrderType) => void;
  setTable: (tableId: string | null, tableName: string | null) => void;
  setDiscountCents: (discountCents: number) => void;
};

const fresh = {
  hydrated: true,
  orderId: null as string | null,
  orderNumber: null as string | null,
  version: 0,
  orderType: "TAKEAWAY" as OrderType,
  tableId: null as string | null,
  tableName: null as string | null,
  status: "OPEN" as OrderStatus,
  kitchenServed: false,
  additionMode: false,
  discountCents: 0,
  lines: [] as CartLine[],
  dirty: false,
};

export const usePosStore = create<PosState>((set) => ({
  ...fresh,
  hydrated: false,
  loadOrder: (order) =>
    set((state) => ({
      hydrated: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      version: order.version,
      orderType: order.orderType,
      tableId: order.tableId,
      tableName: order.tableName,
      status: order.status,
      kitchenServed: order.kitchenServed,
      additionMode: state.orderId === order.id && state.additionMode && order.status === "OPEN",
      discountCents: order.discountCents,
      dirty: false,
      lines: order.items
        .filter((item) => item.productId)
        .map((item) => ({
          productId: item.productId as string,
          name: item.name,
          unitPriceCents: item.unitPriceCents,
          quantity: item.quantity,
          itemId: item.id,
          lineKey: item.id,
          locked: order.lockedItemIds.includes(item.id),
          isAddition: order.additionItemIds.includes(item.id),
          modifierOptionIds: item.modifiers.map((modifier) => modifier.optionId).filter((id): id is string => Boolean(id)),
          modifiers: item.modifiers,
          instructions: item.instructions,
        })),
    })),
  beginAdditions: () => set((state) => state.kitchenServed && state.status === "OPEN" ? { additionMode: true } : {}),
  finishAdditions: () => set({ additionMode: false }),
  startNew: (input) =>
    set({
      ...fresh,
      orderType: input?.orderType ?? "TAKEAWAY",
      tableId: input?.tableId ?? null,
      tableName: input?.tableName ?? null,
    }),
  add: (product) =>
    set((state) => ({
      lines: addProduct(state.lines, product).map((line) => !line.itemId && state.additionMode ? { ...line, isAddition: true } : line),
      dirty: true,
    })),
  increment: (productId) =>
    set((state) => ({
      lines: state.lines.some((line) => (line.lineKey ?? line.productId) === productId && line.locked) ? state.lines : changeQuantity(state.lines, productId, 1),
      dirty: true,
    })),
  decrement: (productId) =>
    set((state) => ({
      lines: state.lines.some((line) => (line.lineKey ?? line.productId) === productId && line.locked) ? state.lines : changeQuantity(state.lines, productId, -1),
      dirty: true,
    })),
  remove: (productId) =>
    set((state) => ({
      lines: state.lines.some((line) => (line.lineKey ?? line.productId) === productId && line.locked) ? state.lines : removeProduct(state.lines, productId),
      dirty: true,
    })),
  clear: () => set({ lines: clearCart(), discountCents: 0, dirty: true }),
  setOrderType: (orderType) =>
    set((state) => ({
      orderType,
      tableId: orderType === "TAKEAWAY" ? null : state.tableId,
      tableName: orderType === "TAKEAWAY" ? null : state.tableName,
      dirty: true,
    })),
  setTable: (tableId, tableName) => set({ tableId, tableName, dirty: true }),
  setDiscountCents: (discountCents) => set({ discountCents, dirty: true }),
}));
