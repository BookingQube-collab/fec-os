"use client";

import { useParams } from "next/navigation";

import { AmcContractFormPage } from "./amc-contract-page";

export default function AmcContractEditRoutePage() {
  const { id } = useParams() as { id: string };
  return <AmcContractFormPage contractId={id} />;
}
