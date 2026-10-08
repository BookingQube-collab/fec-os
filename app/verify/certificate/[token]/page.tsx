import { loadPublicCertificate } from "@/lib/training/certificate-public";
import TrainingVerifyPage from "@/views/training-verify-page";

export default async function CertificateVerificationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const certificate = await loadPublicCertificate(token);
  return <TrainingVerifyPage certificate={certificate} />;
}
