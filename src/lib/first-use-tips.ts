export const FIRST_USE_TIPS = {
  register: { title: "Start with a table or takeaway", description: "Select a table for dine-in, add dishes, then save or send the order to the kitchen. Options and kitchen notes are available when you select a dish." },
  tables: { title: "Settle a table right here", description: "Select an occupied table to review its order and take payment in the same popup. Close the table after the balance is paid and service is finished." },
  checkout: { title: "Cash or card, then an optional tip", description: "Choose how the guest paid. Add a tip if they want to (5–15% or a custom amount). For cash, enter what you received to see the change. Splitting the bill is optional." },
  split: { title: "Choose how to share the check", description: "Split equally calculates shares automatically. Use Guest / items to assign dishes, or Custom amounts for agreed totals. Review and save the proposal before taking payment." },
  custom: { title: "Enter each person’s final share", description: "The shares must total the table total after discount. Paid allocations stay locked. Your saved split changes only when you confirm and save." },
  items: { title: "Assign a dish to its payees", description: "Add payees, then choose Edit shares on a dish. Assign whole units or dollar amounts. Finish assigning all items before taking individual guest payments." },
  paid: { title: "Payment recorded; service stays open", description: "You can view the receipt now. A paid table stays open until you choose Close table, so you decide when the seats are ready for the next guests." },
  additions: { title: "Additions stay linked to this order", description: "Add new dishes, then choose Send additions. The kitchen receives a linked ticket with only the new items, and the table total updates with the additions." },
  kitchen: { title: "Move tickets through service", description: "Move each ticket from New to Preparing, Ready, then Served. Served tickets leave the active queue and remain available in History." },
  menu: { title: "Build the restaurant’s menu", description: "Manage categories, dishes, prices, photos and modifiers here. Availability controls whether a dish can be added to an order." },
  closeout: { title: "Start and close the day here", description: "Start the day with the cash float in the drawer. At closing, count the drawer and enter the total: you’ll see if it’s short or over, plus sales, card totals and tips for each server." },
} as const;
export type FirstUseTip = keyof typeof FIRST_USE_TIPS;
export const TIP_EVENT = "salud:first-use-tip";
export const HELP_EVENT = "salud:open-guide";
export const TIPS_STORAGE_KEY = "salud:first-use:v1";
/** Called after every successful login so tips show again for each new session. */
export function resetFirstUseTips() { try { localStorage.removeItem(TIPS_STORAGE_KEY); } catch { /* Storage unavailable: tips already reset per visit. */ } }
export function showFirstUseTip(id: FirstUseTip) { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(TIP_EVENT, { detail: id })); }
