import { DashboardChrome } from "@/components/dashboard/DashboardChrome";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <DashboardChrome userName="Willian.Fernandes" organization="UP SERVIÇOS (SUPERVISÃO) - Nova (1876)">
      {children}
    </DashboardChrome>
  );
}
