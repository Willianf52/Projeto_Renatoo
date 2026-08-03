import { Spinner } from "@/components/Spinner";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-brand-muted">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
