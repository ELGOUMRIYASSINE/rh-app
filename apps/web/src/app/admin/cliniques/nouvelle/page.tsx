import type { Metadata } from "next";
import { NewClinic } from "@/components/admin/new-clinic";

export const metadata: Metadata = { title: "Nouvelle clinique" };

export default function NewClinicPage() {
  return <NewClinic />;
}
