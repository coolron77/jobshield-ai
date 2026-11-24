import type { Metadata } from "next";
import { SalaryChecker } from "@/components/tools/salary-checker";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Salary reality check" };

export default function Page() {
  return (
    <>
      <PageHeader title="Salary reality check" description="Flag unrealistic pay promises. If no reliable benchmark exists for the role, we say so instead of guessing." />
      <SalaryChecker />
    </>
  );
}
