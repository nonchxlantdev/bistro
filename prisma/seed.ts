import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

export const DEMO_IDS = {
  business: "biz_demo",
  location: "loc_main",
  settings: "settings_demo",
  categories: {
    coffee: "cat_coffee",
    food: "cat_food",
    desserts: "cat_desserts",
    drinks: "cat_drinks",
  },
} as const;

const categories = [
  { id: DEMO_IDS.categories.coffee, name: "Coffee", sortOrder: 1 },
  { id: DEMO_IDS.categories.food, name: "Food", sortOrder: 2 },
  { id: DEMO_IDS.categories.desserts, name: "Desserts", sortOrder: 3 },
  { id: DEMO_IDS.categories.drinks, name: "Drinks", sortOrder: 4 },
];

const products = [
  ["prod_espresso", DEMO_IDS.categories.coffee, "Espresso", "Short, concentrated coffee.", 500],
  ["prod_americano", DEMO_IDS.categories.coffee, "Americano", "Espresso lengthened with hot water.", 600],
  ["prod_cappuccino", DEMO_IDS.categories.coffee, "Cappuccino", "Espresso with steamed milk and foam.", 850],
  ["prod_latte", DEMO_IDS.categories.coffee, "Latte", "Espresso with steamed milk.", 900],
  ["prod_mocha", DEMO_IDS.categories.coffee, "Mocha", "Espresso, chocolate, and steamed milk.", 1000],
  ["prod_iced_coffee", DEMO_IDS.categories.coffee, "Iced Coffee", "Chilled coffee served over ice.", 1000],
  ["prod_chicken_sandwich", DEMO_IDS.categories.food, "Chicken Sandwich", "Grilled chicken on a soft roll.", 1500],
  ["prod_beef_burger", DEMO_IDS.categories.food, "Beef Burger", "Beef patty with lettuce and tomato.", 1800],
  ["prod_chicken_wrap", DEMO_IDS.categories.food, "Chicken Wrap", "Sliced chicken wrapped with greens.", 1600],
  ["prod_fries", DEMO_IDS.categories.food, "French Fries", "Crisp salted fries.", 700],
  ["prod_breakfast", DEMO_IDS.categories.food, "Breakfast Plate", "Eggs, toast, and breakfast sides.", 2000],
  ["prod_grilled_cheese", DEMO_IDS.categories.food, "Grilled Cheese", "Toasted bread with melted cheese.", 1200],
  ["prod_cheesecake", DEMO_IDS.categories.desserts, "Cheesecake", "Baked cheesecake slice.", 1200],
  ["prod_chocolate_cake", DEMO_IDS.categories.desserts, "Chocolate Cake", "Rich chocolate layer cake.", 1100],
  ["prod_brownie", DEMO_IDS.categories.desserts, "Brownie", "Dense chocolate brownie.", 700],
  ["prod_cookie", DEMO_IDS.categories.desserts, "Chocolate Cookie", "Warm chocolate cookie.", 400],
  ["prod_water", DEMO_IDS.categories.drinks, "Bottled Water", "Still bottled water.", 300],
  ["prod_orange", DEMO_IDS.categories.drinks, "Orange Juice", "Fresh orange juice.", 600],
  ["prod_lemonade", DEMO_IDS.categories.drinks, "Lemonade", "House lemonade.", 500],
  ["prod_iced_tea", DEMO_IDS.categories.drinks, "Iced Tea", "Chilled black tea.", 500],
] as const;

export async function seed(prisma: PrismaClient) {
  await prisma.business.upsert({
    where: { id: DEMO_IDS.business },
    update: {},
    create: { id: DEMO_IDS.business, name: "Salud Bistro", currency: "BZD" },
  });

  await prisma.location.upsert({
    where: { id: DEMO_IDS.location },
    update: {},
    create: {
      id: DEMO_IDS.location,
      businessId: DEMO_IDS.business,
      name: "Main Branch",
      address: "Belize City",
    },
  });

  await prisma.businessSettings.upsert({
    where: { id: DEMO_IDS.settings },
    update: {},
    create: {
      id: DEMO_IDS.settings,
      businessId: DEMO_IDS.business,
      businessName: "Salud Bistro",
      currency: "BZD",
      receiptFooter: "Thank you for visiting Salud Bistro.",
    },
  });

  await prisma.orderCounter.upsert({
    where: { businessId: DEMO_IDS.business },
    update: {},
    create: { businessId: DEMO_IDS.business, nextNumber: 1 },
  });

  for (const category of categories) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: {},
      create: { ...category, businessId: DEMO_IDS.business, isActive: true },
    });
  }

  for (const [id, categoryId, name, description, priceCents] of products) {
    await prisma.product.upsert({
      where: { id },
      update: {},
      create: {
        id,
        businessId: DEMO_IDS.business,
        categoryId,
        name,
        description,
        priceCents,
        isActive: true,
      },
    });
  }

  const modifierGroups = [
    { id: "mod_group_coffee_size", name: "Size", minSelect: 0, maxSelect: 1, productId: "prod_cappuccino", options: [["mod_small", "Small", 0], ["mod_medium", "Medium", 150], ["mod_large", "Large", 300]] },
    { id: "mod_group_coffee_milk", name: "Milk", minSelect: 0, maxSelect: 1, productId: "prod_cappuccino", options: [["mod_almond", "Almond milk", 200], ["mod_oat", "Oat milk", 200]] },
    { id: "mod_group_burger_extras", name: "Burger extras", minSelect: 0, maxSelect: 3, productId: "prod_beef_burger", options: [["mod_cheese", "Extra cheese", 200], ["mod_bacon", "Bacon", 400], ["mod_no_onion", "No onions", 0]] },
  ] as const;
  for (const group of modifierGroups) {
    await prisma.modifierGroup.upsert({ where: { id: group.id }, update: {}, create: { id: group.id, businessId: DEMO_IDS.business, name: group.name, minSelect: group.minSelect, maxSelect: group.maxSelect } });
    await prisma.productModifierGroup.upsert({ where: { productId_groupId: { productId: group.productId, groupId: group.id } }, update: {}, create: { productId: group.productId, groupId: group.id } });
    for (const [sortOrder, [id, name, priceDeltaCents]] of group.options.entries()) {
      await prisma.modifierOption.upsert({ where: { id }, update: {}, create: { id, groupId: group.id, name, priceDeltaCents, sortOrder } });
    }
  }

  for (let number = 1; number <= 12; number += 1) {
    const capacity = number <= 4 ? 2 : number <= 8 ? 4 : 6;
    await prisma.restaurantTable.upsert({
      where: { id: `tbl_${String(number).padStart(2, "0")}` },
      update: {},
      create: {
        id: `tbl_${String(number).padStart(2, "0")}`,
        businessId: DEMO_IDS.business,
        locationId: DEMO_IDS.location,
        name: `Table ${number}`,
        capacity,
        sortOrder: number,
        isReserved: false,
      },
    });
  }
}

async function main() {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
  try {
    await seed(prisma);
    console.log("Seed complete. Existing sales were left untouched.");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.env.VITEST !== "true") {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
