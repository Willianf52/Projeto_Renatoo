import { SomenteGestor } from "@/components/dashboard/SomenteGestor";

/** So do GESTOR, como no sistema de referencia: ver `SomenteGestor`. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SomenteGestor>{children}</SomenteGestor>;
}
