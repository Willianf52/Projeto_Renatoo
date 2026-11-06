import { SomenteGestor } from "@/components/dashboard/SomenteGestor";

/** So do GESTOR, a pedido do dono (06/11/2026): ver `SomenteGestor`. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SomenteGestor>{children}</SomenteGestor>;
}
