import { createClient } from "@/lib/supabase/client";

/**
 * Telemetria de uso do painel (P2-4, migration 0051).
 *
 * Grava direto do NAVEGADOR, com a sessao de quem esta usando: quem e o autor
 * e com qual cargo o banco decide (trigger `preencher_autor_do_evento` e grant
 * so em `evento`/`detalhes`), entao nao ha o que proteger num servidor no
 * meio -- e uma Server Action a cada navegacao seria uma ida e volta a mais
 * so para repassar o mesmo insert.
 *
 * NUNCA DERRUBA A TELA. Telemetria que falha (rede, conta que acabou de ser
 * desativada, tabela ainda nao aplicada em algum ambiente) vira aviso no
 * console e mais nada. O custo de perder um evento e zero; o de uma tela
 * quebrada por causa dele, nao.
 *
 * Checklist enviado e importacao nao passam por aqui: ja sao linhas em
 * `checklists` e `importacoes` (ver o cabecalho da 0051).
 */

export type EventoDeUso = "login" | "tela_aberta";

type Detalhes = Record<string, string | string[]>;

export function registrarEvento(evento: EventoDeUso, detalhes: Detalhes = {}): void {
  try {
    void Promise.resolve(createClient().from("eventos_de_uso").insert({ evento, detalhes })).then(
      ({ error }) => {
        if (error) console.warn(`[telemetria] evento ${evento} nao registrado: ${error.message}`);
      },
      (falha: unknown) => console.warn(`[telemetria] evento ${evento} nao registrado`, falha),
    );
  } catch (falha) {
    console.warn(`[telemetria] evento ${evento} nao registrado`, falha);
  }
}

/**
 * Nomes dos filtros preenchidos, nunca os valores. "Com qual filtro o
 * relatorio e aberto" e a pergunta de produto; qual site ou qual funcionario
 * seria dado de operacao repetido numa tabela de telemetria.
 *
 * `pagina` fica de fora: e navegacao, nao filtro.
 */
export function nomesDosFiltros(busca: string): string[] {
  const nomes = new Set<string>();
  for (const [chave, valor] of new URLSearchParams(busca)) {
    if (chave !== "pagina" && valor.trim() !== "") nomes.add(chave);
  }
  return [...nomes].sort();
}

/**
 * Rota com os ids trocados por `:id`, para `/qr-code/12/editar` e
 * `/qr-code/13/editar` somarem na mesma linha -- e para o id de um registro
 * nao virar dado guardado na telemetria.
 */
export function rotaNormalizada(caminho: string): string {
  return caminho
    .split("/")
    .map((segmento) =>
      /^\d+$/.test(segmento) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segmento)
        ? ":id"
        : segmento,
    )
    .join("/");
}
