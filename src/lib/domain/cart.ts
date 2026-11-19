export type CartProduct = {
  id: string;
  name: string;
  priceCents: number;
  modifierOptionIds?: string[];
  modifiers?: Array<{ optionId: string | null; groupName: string; optionName: string; priceDeltaCents: number }>;
  instructions?: string;
};

export type CartLine = {
  locked?: boolean;
  isAddition?: boolean;
  productId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  itemId?: string;
  lineKey?: string;
  modifierOptionIds?: string[];
  modifiers?: CartProduct["modifiers"];
  instructions?: string;
};

export function cartLineKey(line: CartLine) { return line.lineKey ?? line.productId; }

function assertQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    throw new Error("Quantity must be a whole number from 1 to 999.");
  }
}

export function addProduct(lines: CartLine[], product: CartProduct, quantity = 1): CartLine[] {
  assertQuantity(quantity);
  if (!Number.isInteger(product.priceCents) || product.priceCents < 0) {
    throw new Error("Product price must be a whole number of cents.");
  }

  const options = [...(product.modifierOptionIds ?? [])].sort();
  const instructions = product.instructions?.trim() ?? "";
  const customized = options.length > 0 || instructions.length > 0;
  const key = customized ? JSON.stringify([product.id, options, instructions]) : product.id;
  const existing = lines.find((line) => cartLineKey(line) === key);
  if (!existing) {
    return [
      ...lines,
      {
        productId: product.id,
        name: product.name,
        unitPriceCents: product.priceCents,
        quantity,
        ...(customized ? { lineKey: key, modifierOptionIds: options, modifiers: product.modifiers ?? [], instructions } : {}),
      },
    ];
  }

  const nextQuantity = existing.quantity + quantity;
  assertQuantity(nextQuantity);
  return lines.map((line) =>
    cartLineKey(line) === key ? { ...line, quantity: nextQuantity } : line,
  );
}

export function setQuantity(lines: CartLine[], productId: string, quantity: number): CartLine[] {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error("Quantity must be a whole number.");
  }
  if (quantity === 0) {
    return removeProduct(lines, productId);
  }
  assertQuantity(quantity);
  return lines.map((line) => (cartLineKey(line) === productId ? { ...line, quantity } : line));
}

export function changeQuantity(lines: CartLine[], productId: string, delta: number): CartLine[] {
  const current = lines.find((line) => cartLineKey(line) === productId);
  if (!current) return lines;
  if (!Number.isInteger(delta)) {
    throw new Error("Quantity change must be a whole number.");
  }
  return setQuantity(lines, productId, current.quantity + delta);
}

export function removeProduct(lines: CartLine[], productId: string): CartLine[] {
  return lines.filter((line) => cartLineKey(line) !== productId);
}

export function clearCart(): CartLine[] {
  return [];
}
