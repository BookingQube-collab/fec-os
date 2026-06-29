"use client";

import { useParams } from "next/navigation";

import { AmcContractDetailPage } from "./amc-contract-page";

export default function AmcContractDetailRoutePage() {
  const { id } = useParams() as { id: string };
  return <AmcContractDetailPage id={id} />;
}
