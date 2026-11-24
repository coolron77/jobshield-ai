import type { Metadata } from "next";
import { CompanyChecker } from "@/components/tools/company-checker";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Company information check" };

export default function Page() {
  return (
    <>
      <PageHeader title="Company information check" description="Compare the recruiter's email and the company website, and see clearly what was verified, what you told us, and what wasn't checked." />
      <CompanyChecker />
    </>
  );
}
