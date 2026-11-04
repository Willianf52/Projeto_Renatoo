import { abrirFila } from "./fila";

/**
 * "Logs de envio de dados" do app do sistema de referencia: o que este
 * aparelho mandou (ou tentou mandar) ao servidor, com o estado de cada envio.
 *
 * A fonte e a propria fila (`fila.ts`): cada visita capturada no aparelho e
 * um registro, com tentativas, ultimo erro e as leituras dela. Nao ha tabela
 * nova -- a fila ja guarda tudo isso para a sincronizacao.
 *
 * "Apagar logs" apaga so o que ja subiu e e de antes de hoje: a visita de hoje
 * ainda serve ao `visita-do-dia.ts` (o QR reabre a visita sem checklist), e o
 * que nao subiu e dado de campo, nao log.
 */

export type StatusDoLog = "SUCESSO" | "PENDENTE" | "ERRO";

export const ROTULO_DO_LOG: Record<StatusDoLog, string> = {
  SUCESSO: "Sucesso",
  PENDENTE: "Pendente",
  ERRO: "Erro",
};

export type LogDeEnvio = {
  chave: string;
  siteId: number;
  capturadoEm: string;
  visitaId: number | null;
  tentativas: number;
  ultimoErro: string | null;
  status: StatusDoLog;
  leituras: number;
  leiturasPendentes: number;
  termino: boolean;
};

type Linha = {
  chave: string;
  site_id: number;
  capturado_em: string;
  visita_id: number | null;
  enviada: number;
  tentativas: number;
  ultimo_erro: string | null;
  leituras: number;
  pendentes: number;
  termino: number;
};

/** Pura: o estado de um registro da fila. */
export function statusDoLog(linha: { enviada: number; ultimo_erro: string | null; pendentes: number }): StatusDoLog {
  if (linha.enviada === 1 && linha.pendentes === 0) return "SUCESSO";
  if (linha.ultimo_erro) return "ERRO";
  return "PENDENTE";
}

export async function lerLogs(funcionarioId: string): Promise<LogDeEnvio[]> {
  const banco = await abrirFila();
  const linhas = await banco.getAllAsync<Linha>(
    `select v.chave, v.site_id, v.capturado_em, v.visita_id, v.enviada, v.tentativas, v.ultimo_erro,
            count(l.id) as leituras,
            coalesce(sum(case when l.enviada = 0 then 1 else 0 end), 0) as pendentes,
            coalesce(max(l.termino), 0) as termino
       from visitas_na_fila v
       left join leituras_na_fila l on l.chave_da_visita = v.chave
      where v.funcionario_id = ?
      group by v.chave
      order by v.capturado_em desc
      limit 200`,
    funcionarioId,
  );
  return linhas.map((l) => ({
    chave: l.chave,
    siteId: l.site_id,
    capturadoEm: l.capturado_em,
    visitaId: l.visita_id,
    tentativas: l.tentativas,
    ultimoErro: l.ultimo_erro,
    status: statusDoLog(l),
    leituras: l.leituras,
    leiturasPendentes: l.pendentes,
    termino: l.termino === 1,
  }));
}

/** Apaga os enviados de antes de `inicioDeHoje` (ISO). Devolve quantos saiu. */
export async function apagarLogsEnviados(funcionarioId: string, inicioDeHoje: string): Promise<number> {
  const banco = await abrirFila();
  const filtro = `funcionario_id = ? and enviada = 1 and capturado_em < ?
     and not exists (select 1 from leituras_na_fila l where l.chave_da_visita = visitas_na_fila.chave and l.enviada = 0)`;
  await banco.runAsync(
    `delete from leituras_na_fila where chave_da_visita in (select chave from visitas_na_fila where ${filtro})`,
    funcionarioId,
    inicioDeHoje,
  );
  const resultado = await banco.runAsync(`delete from visitas_na_fila where ${filtro}`, funcionarioId, inicioDeHoje);
  return resultado.changes;
}

/**
 * "Compartilhar dados": o texto que o inspetor manda ao suporte pelo app que
 * quiser (WhatsApp, e-mail). Sem coordenada nem foto: so o estado da fila.
 * Pura.
 */
export function textoParaCompartilhar(entrada: {
  nome: string;
  versao: string;
  atualizacao: string | null;
  sincronizadoEm: string | null;
  logs: readonly LogDeEnvio[];
}): string {
  const contar = (s: StatusDoLog) => entrada.logs.filter((l) => l.status === s).length;
  const linhas = [
    "Dados do app de campo",
    `Usuário: ${entrada.nome}`,
    `Versão: ${entrada.versao}${entrada.atualizacao ? ` · atualização ${entrada.atualizacao}` : ""}`,
    `Sincronizado: ${entrada.sincronizadoEm ?? "nunca neste aparelho"}`,
    `Envios: ${entrada.logs.length} (sucesso ${contar("SUCESSO")}, pendente ${contar("PENDENTE")}, erro ${contar("ERRO")})`,
  ];
  const comErro = entrada.logs.filter((l) => l.status !== "SUCESSO").slice(0, 20);
  if (comErro.length > 0) {
    linhas.push("", "Pendentes e com erro:");
    for (const l of comErro) {
      linhas.push(
        `- coleta ${l.chave}, site ${l.siteId}, ${l.capturadoEm}, ${ROTULO_DO_LOG[l.status]}, ${l.tentativas} tentativa(s)` +
          (l.ultimoErro ? `: ${l.ultimoErro}` : ""),
      );
    }
  }
  return linhas.join("\n");
}
