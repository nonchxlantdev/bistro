import { SplitBillScreen } from "@/components/orders/split-bill-screen";

export default async function SplitBillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SplitBillScreen orderId={id} />;
}
