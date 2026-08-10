import { NextResponse, type NextRequest } from "next/server";
import {
  chaveDaVisita,
  indexarPorNome,
  lerLoteDeColetas,
  resolverReferencia,
  type ColetaImportada,
  type IndicePorNome,
} from "@/lib/importar-coletas";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { segredoConfere } from "@/lib/webhook-user-updated";

/**
 * Entrada dos lotes de coleta vindos do sistema de origem.
 *
 * As migrations 0003/0004 dao policy apenas de SELECT as tabelas operacionais
 * e registram que a escrita "ocorre no servidor com service_role, nunca a
 * partir do navegador". Esta rota e essa escrita: sem ela, `visitas` e
 * `leituras` nao tem caminho de entrada nenhum e a tela de Coletas Importadas
 * lista vazio em qualquer ambiente novo.
 *
 * Autenticacao por segredo compartilhado, e nao por sessao: quem chama e um
 * processo de integracao, nao um navegador com cookie. Mesmo mecanismo
 * (e mesma comparacao em tempo constante) do webhook de troca de senha.
 */

/** Nao ha nada para cachear numa rota de escrita, e o Next nao deve tentar
 * pre-renderizar isto no build. */
export const dynamic = "force-dynamic";

type Referencias = {
  sites: IndicePorNome;
  areas: IndicePorNome;
  motivos: IndicePorNome;
  coletores: IndicePorNome;
  eventos: IndicePorNome;
  acoes: IndicePorNome;
  qualificadores: IndicePorNome;
  qrCodes: IndicePorNome;
  funcionarios: Map<string, string>;
};

type Cliente = ReturnType<typeof createAdminClient>;

async function carregarReferencias(supabase: Cliente): Promise<Referencias> {
  const [sites, areas, motivos, coletores, eventos, acoes, qualificadores, qrCodes, perfis] =
    await Promise.all([
      supabase.from("sites").select("id, nome"),
      supabase.from("areas").select("id, nome"),
      supabase.from("motivos_visita").select("id, nome"),
      supabase.from("coletores_dados").select("id, nome"),
      supabase.from("eventos").select("id, nome"),
      supabase.from("acoes").select("id, nome"),
      supabase.from("qualificadores").select("id, nome"),
      supabase.from("qr_codes").select("id, codigo"),
      supabase.from("profiles").select("id, email"),
    ]);

  const falha = [sites, areas, motivos, coletores, eventos, acoes, qualificadores, qrCodes, perfis]
    .map((resposta) => resposta.error)
    .find(Boolean);
  if (falha) throw falha;

  // Perfis sao indexados a parte: a chave primaria e uuid (texto), nao o
  // bigint que `indexarPorNome` devolve.
  const funcionarios = new Map<string, string>();
  for (const perfil of perfis.data ?? []) {
    if (perfil.email) funcionarios.set(perfil.email.toLowerCase(), perfil.id);
  }

  return {
    sites: indexarPorNome(sites.data, "nome"),
    areas: indexarPorNome(areas.data, "nome"),
    motivos: indexarPorNome(motivos.data, "nome"),
    coletores: indexarPorNome(coletores.data, "nome"),
    eventos: indexarPorNome(eventos.data, "nome"),
    acoes: indexarPorNome(acoes.data, "nome"),
    qualificadores: indexarPorNome(qualificadores.data, "nome"),
    qrCodes: indexarPorNome(qrCodes.data, "codigo"),
    funcionarios,
  };
}

type LinhaResolvida = {
  visita: { numero_coleta: number; site_id: number };
  visitaExtra: {
    funcionario_id: string | null;
    motivo_visita_id: number | null;
    coletor_dados_id: number | null;
    data_integracao: string | null;
  };
  leitura: {
    area_id: number | null;
    qr_code_id: number | null;
    data_hora: string;
    tem_localizacao: boolean;
    evento_id: number | null;
    acao_id: number | null;
    qualificador_id: number | null;
    observacao: string | null;
    data_integracao: string | null;
  };
};

function resolverLinha(
  coleta: ColetaImportada,
  referencias: Referencias,
): { ok: true; linha: LinhaResolvida } | { ok: false; erro: string } {
  const site = resolverReferencia(referencias.sites, coleta.site, "site");
  if (!site.ok) return site;

  const area = resolverReferencia(referencias.areas, coleta.area, "área");
  if (!area.ok) return area;

  const motivo = resolverReferencia(referencias.motivos, coleta.motivoVisita, "motivo de visita");
  if (!motivo.ok) return motivo;

  const coletor = resolverReferencia(referencias.coletores, coleta.coletorDados, "coletor de dados");
  if (!coletor.ok) return coletor;

  const evento = resolverReferencia(referencias.eventos, coleta.evento, "evento");
  if (!evento.ok) return evento;

  const acao = resolverReferencia(referencias.acoes, coleta.acao, "ação");
  if (!acao.ok) return acao;

  const qualificador = resolverReferencia(
    referencias.qualificadores,
    coleta.qualificador,
    "qualificador",
  );
  if (!qualificador.ok) return qualificador;

  const qrCode = resolverReferencia(referencias.qrCodes, coleta.qrCode, "QR code");
  if (!qrCode.ok) return qrCode;

  let funcionarioId: string | null = null;
  if (coleta.funcionarioEmail) {
    funcionarioId = referencias.funcionarios.get(coleta.funcionarioEmail.toLowerCase()) ?? null;
    if (!funcionarioId) {
      return { ok: false, erro: `funcionário "${coleta.funcionarioEmail}" não está cadastrado` };
    }
  }

  return {
    ok: true,
    linha: {
      visita: { numero_coleta: coleta.numeroColeta, site_id: site.id as number },
      visitaExtra: {
        funcionario_id: funcionarioId,
        motivo_visita_id: motivo.id,
        coletor_dados_id: coletor.id,
        data_integracao: coleta.dataIntegracao,
      },
      leitura: {
        area_id: area.id,
        qr_code_id: qrCode.id,
        data_hora: coleta.dataHora,
        tem_localizacao: coleta.temLocalizacao,
        evento_id: evento.id,
        acao_id: acao.id,
        qualificador_id: qualificador.id,
        observacao: coleta.observacao,
        data_integracao: coleta.dataIntegracao,
      },
    },
  };
}

export async function POST(request: NextRequest) {
  const idRequisicao = gerarIdDeRequisicao();

  const segredoEsperado = process.env.IMPORTACAO_SECRET;
  if (!segredoEsperado) {
    erro(idRequisicao, "Importação de coletas: IMPORTACAO_SECRET não configurado no servidor.");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  if (!segredoConfere(request.headers.get("x-importacao-secret"), segredoEsperado)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  const lote = lerLoteDeColetas(corpo);
  if (!lote.ok) return NextResponse.json({ error: lote.erro }, { status: 400 });

  let supabase: Cliente;
  try {
    supabase = createAdminClient();
  } catch (falha) {
    erro(idRequisicao, "Importação de coletas: service_role indisponível.", falha);
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  let referencias: Referencias;
  try {
    referencias = await carregarReferencias(supabase);
  } catch (falha) {
    erro(idRequisicao, "Importação de coletas: falha ao carregar tabelas de referência.", falha);
    return NextResponse.json({ error: "falha ao consultar o banco" }, { status: 502 });
  }

  // O lote inteiro e resolvido antes de qualquer escrita. Importar as linhas
  // validas e listar as invalidas deixaria o lote metade dentro e metade fora,
  // e quem reenvia o arquivo corrigido nao teria como saber o que ja entrou.
  const linhas: LinhaResolvida[] = [];
  const problemas: string[] = [];
  for (const [indice, coleta] of lote.coletas.entries()) {
    const resolvida = resolverLinha(coleta, referencias);
    if (!resolvida.ok) {
      problemas.push(`linha ${indice + 1}: ${resolvida.erro}`);
      continue;
    }
    linhas.push(resolvida.linha);
  }

  if (problemas.length > 0) {
    // Teto na resposta: um lote de mil linhas contra um banco vazio geraria
    // mil mensagens praticamente iguais.
    return NextResponse.json(
      {
        error: "lote não importado: há linhas com referências desconhecidas",
        problemas: problemas.slice(0, 20),
        total_de_problemas: problemas.length,
      },
      { status: 422 },
    );
  }

  // 1) Visitas. Varias leituras compartilham a mesma visita (tipicamente
  // Inicio e Termino da mesma passagem), entao o lote e agrupado antes.
  const visitasPorChave = new Map<string, LinhaResolvida>();
  for (const linha of linhas) {
    const chave = chaveDaVisita(linha.visita.numero_coleta, linha.visita.site_id);
    // A primeira linha de cada visita define os campos de visita. As demais
    // repetem os mesmos valores -- o formato achatado os traz em toda linha.
    if (!visitasPorChave.has(chave)) visitasPorChave.set(chave, linha);
  }

  const { data: visitasGravadas, error: erroVisitas } = await supabase
    .from("visitas")
    .upsert(
      [...visitasPorChave.values()].map((linha) => ({
        ...linha.visita,
        ...linha.visitaExtra,
      })),
      // A constraint da migration 0004. `ignoreDuplicates: false` faz o
      // reenvio de um lote atualizar a visita existente em vez de falhar --
      // reimportar o mesmo arquivo e uma operacao normal aqui.
      { onConflict: "numero_coleta,site_id", ignoreDuplicates: false },
    )
    .select("id, numero_coleta, site_id");

  if (erroVisitas) {
    erro(idRequisicao, "Importação de coletas: falha ao gravar visitas.", erroVisitas);
    return NextResponse.json({ error: "falha ao gravar visitas" }, { status: 502 });
  }

  const idPorChave = new Map<string, number>();
  for (const visita of visitasGravadas ?? []) {
    idPorChave.set(chaveDaVisita(visita.numero_coleta, visita.site_id), visita.id);
  }

  // 2) Leituras.
  const leituras = linhas.map((linha) => ({
    visita_id: idPorChave.get(
      chaveDaVisita(linha.visita.numero_coleta, linha.visita.site_id),
    ) as number,
    ...linha.leitura,
  }));

  const { data: leiturasGravadas, error: erroLeituras } = await supabase
    .from("leituras")
    .upsert(leituras, {
      onConflict: "visita_id,area_id,data_hora",
      // Diferente das visitas: leitura repetida e o mesmo evento chegando duas
      // vezes, nao uma correcao. Ignorar mantem a reimportacao idempotente.
      //
      // A constraint e `nulls not distinct` desde a migration 0017: sem isso,
      // leitura sem `area_id` (campo opcional no formato) escaparia da
      // deduplicacao, porque indice unico comum nao considera dois NULL iguais.
      ignoreDuplicates: true,
    })
    .select("id");

  if (erroLeituras) {
    erro(idRequisicao, "Importação de coletas: falha ao gravar leituras.", erroLeituras);
    return NextResponse.json({ error: "falha ao gravar leituras" }, { status: 502 });
  }

  return NextResponse.json({
    importado: true,
    visitas: visitasGravadas?.length ?? 0,
    leituras_recebidas: leituras.length,
    leituras_novas: leiturasGravadas?.length ?? 0,
  });
}
