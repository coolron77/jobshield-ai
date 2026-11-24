import type { Metadata } from "next";
import { ScanForm } from "@/components/scan/scan-form";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Scan a job ad" };

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const { url } = await searchParams;
  return (
    <>
      <PageHeader title="Scan a job or internship ad" description="Paste the advertisement and, if you have it, the link. You'll get a report with highlighted evidence and steps to verify the employer." />
      <ScanForm initialUrl={typeof url === "string" ? url.slice(0, 2048) : ""} />
    </>
  );
}
