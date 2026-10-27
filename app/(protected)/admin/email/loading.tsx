import { FecLoader } from "@/components/fec";

export default function AdminEmailLoading() {
  return (
    <div className="flex justify-center py-16">
      <FecLoader density="page" />
    </div>
  );
}
