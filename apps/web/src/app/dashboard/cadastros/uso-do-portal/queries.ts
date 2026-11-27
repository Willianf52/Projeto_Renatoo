import { TELAS_DO_MENU } from "@/components/dashboard/telas-do-menu";
import { dataValida, formatarDataHora, FUSO_DO_PROJETO } from "@/lib/data-hora";
import { createClient } from "@/lib/supabase/server";
import { NIVEIS_ACESSO } from "../usuarios/constantes";

/**
 * "Uso do Portal" (27/11/2026): no lugar do Google Analytics, a soma do que
 * `eventos_de_uso` (0051) ja guarda -- logins e telas abertas no portal --
 * pelas funcoes `relatorio_uso_do_portal` e `relatorio_telas_do_portal`
 * (0117). So o portal: o app de campo nao grava telemetria, e o trabalho dele
 * aparece nas inspecoes.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

export type Filtros = { dataInicial: string; dataFinal: string; cargo?: string };

/** Hoje em Brasilia, AAAA-MM-DD. */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_DO_PROJETO }).format(agora);
}

function diasAntes(dia: string, dias: number): string {
  const data = new Date(`${dia}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() - dias);
  return data.toISOString().slice(0, 10);
}

/** Sem datas na URL, os ultimos 30 dias (hoje incluso). */
export function extrairFiltros(params: SearchParams, agora: Date = new Date()): Filtros {
  const hoje = hojeEmBrasilia(agora);
  const cargo = primeiro(params.cargo);
  return {
    dataInicial: dataValida(primeiro(params.data_inicial)) ?? diasAntes(hoje, 29),
    dataFinal: dataValida(primeiro(params.data_final)) ?? hoje,
    cargo: NIVEIS_ACESSO.some((n) => n.value === cargo) ? cargo : undefined,
  };
}

/** O mesmo teto da funcao do banco (0117). */
export function periodoValido(filtros: Filtros): boolean {
  const inicio = Date.parse(`${filtros.dataInicial}T00:00:00Z`);
  const fim = Date.parse(`${filtros.dataFinal}T00:00:00Z`);
  return fim >= inicio && (fim - inicio) / 86_400_000 <= 366;
}

export function rotuloDoCargo(cargo: string | null): string {
  return NIVEIS_ACESSO.find((n) => n.value === cargo)?.label ?? cargo ?? "";
}

const SUFIXOS: Array<[RegExp, string]> = [
  [/\/:id\/editar$/, "editar"],
  [/\/:id$/, "detalhe"],
  [/\/novo$/, "novo"],
  [/\/importar$/, "importar"],
];

/**
 * A rota gravada (`/dashboard/cadastros/qr-code/:id/editar`) com o nome do
 * menu ("QR-Code (editar)"). Rota que o menu nao conhece aparece como veio.
 */
export function nomeDaTela(rota: string): string {
  if (rota === "/dashboard") return "Início";
  const exata = TELAS_DO_MENU.find((t) => t.href === rota);
  if (exata) return exata.label;
  for (const [padrao, sufixo] of SUFIXOS) {
    if (!padrao.test(rota)) continue;
    const base = TELAS_DO_MENU.find((t) => t.href === rota.replace(padrao, ""));
    if (base) return `${base.label} (${sufixo})`;
  }
  // A tela mais longa do menu que contem a rota (sub-paginas sem sufixo conhecido).
  const pai = [...TELAS_DO_MENU]
    .sort((a, b) => b.href.length - a.href.length)
    .find((t) => rota.startsWith(`${t.href}/`));
  return pai ? `${pai.label} (${rota.slice(pai.href.length + 1)})` : rota;
}

export type LinhaPorPessoa = {
  nome: string;
  cargo: string;
  logins: number;
  telas: number;
  diasComAcesso: number;
  ultimoAcesso: string;
};

export type LinhaPorTela = { tela: string; aberturas: number; pessoas: number };

export type UsoDoPortal = { pessoas: LinhaPorPessoa[]; telas: LinhaPorTela[] };

export async function getUsoDoPortal(filtros: Filtros): Promise<UsoDoPortal> {
  const supabase = await createClient();
  const args = { p_inicio: filtros.dataInicial, p_fim: filtros.dataFinal, p_cargo: filtros.cargo };

  const [pessoas, telas] = await Promise.all([
    supabase.rpc("relatorio_uso_do_portal", args),
    supabase.rpc("relatorio_telas_do_portal", args),
  ]);
  if (pessoas.error) throw pessoas.error;
  if (telas.error) throw telas.error;

  return {
    pessoas: (pessoas.data ?? []).map((l) => ({
      nome: l.nome,
      cargo: rotuloDoCargo(l.cargo),
      logins: l.logins,
      telas: l.telas,
      diasComAcesso: l.dias_com_acesso,
      ultimoAcesso: formatarDataHora(l.ultimo_acesso),
    })),
    telas: juntarTelasPeloNome((telas.data ?? []).map((l) => ({ tela: nomeDaTela(l.rota), aberturas: l.aberturas, pessoas: l.pessoas }))),
  };
}

/**
 * Rotas diferentes podem virar o mesmo nome (ex.: `/dashboard` e uma rota
 * antiga). Soma as aberturas; das pessoas fica o maior numero, porque as
 * distintas de cada rota podem se repetir e somar contaria duas vezes.
 */
export function juntarTelasPeloNome(linhas: LinhaPorTela[]): LinhaPorTela[] {
  const porNome = new Map<string, LinhaPorTela>();
  for (const l of linhas) {
    const atual = porNome.get(l.tela);
    porNome.set(
      l.tela,
      atual ? { tela: l.tela, aberturas: atual.aberturas + l.aberturas, pessoas: Math.max(atual.pessoas, l.pessoas) } : { ...l },
    );
  }
  return [...porNome.values()].sort((a, b) => b.aberturas - a.aberturas || a.tela.localeCompare(b.tela, "pt-BR"));
}

/** Os numeros do topo: soma das linhas por pessoa. */
export function resumo(uso: UsoDoPortal): { pessoas: number; logins: number; telas: number } {
  return {
    pessoas: uso.pessoas.length,
    logins: uso.pessoas.reduce((t, l) => t + l.logins, 0),
    telas: uso.pessoas.reduce((t, l) => t + l.telas, 0),
  };
}
