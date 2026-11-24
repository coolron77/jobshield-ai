import type { Metadata } from "next";
import { PaymentChecker } from "@/components/tools/payment-checker";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Payment scam detector" };

export default function Page() {
  return (
    <>
      <PageHeader title="Payment scam detector" description="Find requests for registration fees, deposits, training charges or equipment purchases — and why they deserve caution." />
      <PaymentChecker />
    </>
  );
}
