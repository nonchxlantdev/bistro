import { PayOrderScreen } from "@/components/orders/pay-order-screen";

export default async function PayOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PayOrderScreen orderId={id} />;
}
