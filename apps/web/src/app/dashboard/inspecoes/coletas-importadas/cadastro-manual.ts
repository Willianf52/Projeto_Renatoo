import { dataValida, horaValida, inicioDoFiltro } from "@/lib/data-hora";
import { filtroDeId, filtroDeUuid } from "@/lib/id-na-url";

/**
 * Leitura do formulario de cadastro manual de coletas (migration 0067). Pura,
 * sem Supabase, para ser testada campo a campo; quem decide de verdade e o
 * banco (`cadastrar_coletas_manuais` e as policies da 0067).
 */

/** O mesmo teto da funcao do banco. */
export const MAXIMO_DE_COLETAS = 50;

export type CadastroManual = {
  /** "yyyy-mm-dd": a listagem volta filtrada neste dia. */
  data: string;
  /** Instante com o fuso da operacao (`inicioDoFiltro`). */
  dataHora: string;
  siteId: number;
  funcionarioId: string;
  quantidade: number;
  coletorDadosId: number | null;
  areaId: number | null;
  eventoId: number | null;
  acaoId: number | null;
  qualificadorId: number | null;
};

export type LeituraDoCadastro = { ok: true; dados: CadastroManual } | { ok: false; erro: string };

function texto(formData: FormData, campo: string): string | undefined {
  const valor = formData.get(campo);
  return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
}

function idOpcional(formData: FormData, campo: string): number | null {
  const id = filtroDeId(texto(formData, campo));
  return id ? Number(id) : null;
}

export function lerCadastroManual(formData: FormData): LeituraDoCadastro {
  const data = dataValida(texto(formData, "data"));
  if (!data) return { ok: false, erro: "Informe a data da coleta." };

  const hora = horaValida(texto(formData, "hora"));
  if (!hora) return { ok: false, erro: "Informe a hora da coleta." };

  const funcionarioId = filtroDeUuid(texto(formData, "funcionario_id"));
  if (!funcionarioId) return { ok: false, erro: "Escolha o funcionário." };

  const siteId = filtroDeId(texto(formData, "site_id"));
  if (!siteId) return { ok: false, erro: "Escolha o local." };

  const quantidadeTexto = texto(formData, "quantidade") ?? "";
  const quantidade = /^\d+$/.test(quantidadeTexto) ? Number(quantidadeTexto) : NaN;
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > MAXIMO_DE_COLETAS) {
    return { ok: false, erro: `A quantidade de coletas deve ficar entre 1 e ${MAXIMO_DE_COLETAS}.` };
  }

  return {
    ok: true,
    dados: {
      data,
      dataHora: inicioDoFiltro(data, hora),
      siteId: Number(siteId),
      funcionarioId,
      quantidade,
      coletorDadosId: idOpcional(formData, "coletor_dados_id"),
      areaId: idOpcional(formData, "area_id"),
      eventoId: idOpcional(formData, "evento_id"),
      acaoId: idOpcional(formData, "acao_id"),
      qualificadorId: idOpcional(formData, "qualificador_id"),
    },
  };
}
