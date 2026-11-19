import { ReceiptScreen } from "@/components/orders/receipt-screen";

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ guest?: string }> }) {
  const { id } = await params;
  const { guest } = await searchParams;
  return <ReceiptScreen orderId={id} guestId={guest} />;
}
