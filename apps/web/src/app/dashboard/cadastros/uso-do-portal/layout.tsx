import { SomenteQuemAcompanhaOUso } from "@/components/dashboard/SomenteQuemAcompanhaOUso";

/** "Uso do Portal" so para quem acompanha o uso (0118, hoje so o dono): ver o componente. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SomenteQuemAcompanhaOUso>{children}</SomenteQuemAcompanhaOUso>;
}
