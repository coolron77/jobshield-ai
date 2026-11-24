import type { Metadata } from "next";
import { UrlChecker } from "@/components/tools/url-checker";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Job link checker" };

export default function Page() {
  return (
    <>
      <PageHeader title="Job link checker" description="Check where a job link really goes — domain, redirects and page content — fetched safely on our server." />
      <UrlChecker />
    </>
  );
}
