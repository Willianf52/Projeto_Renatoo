import { SomenteGestor } from "@/components/dashboard/SomenteGestor";

/** "Uso do Portal" (27/11/2026) e do GESTOR, como os outros cadastros da gestao: ver `SomenteGestor`. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SomenteGestor>{children}</SomenteGestor>;
}
