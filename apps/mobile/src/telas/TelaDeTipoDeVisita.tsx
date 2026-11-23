import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { ROTULO_DO_TIPO, TIPOS_DE_VISITA, type TipoDeVisita } from "@projeto-renatoo/shared";

import { useSessao } from "../auth/SessaoProvider";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { abandonarInspecao, converterParaVisita } from "../campo/acoes-da-visita";
import {
  COR_DA_SITUACAO,
  lerItensDaInspecao,
  ROTULO_DA_SITUACAO,
  type ItemDaInspecao,
  type SituacaoNaInspecao,
} from "../campo/checklists-da-inspecao";
import { abrirFila } from "../campo/fila";
import { dataEHoraDaInspecao } from "../campo/inspecoes-em-andamento";
import { supabase } from "../lib/supabase";
import { tituloDaColeta } from "../lib/titulo-da-coleta";
import { IconeDeFerramenta, IconeDePessoa, IconeDeSeta } from "../componentes/icones";
import { colunaDeLeitura, cores, espaco, raio, texto, tipografia } from "../tema";

/**
 * A TELA DA INSPECAO (22/11/2026), como no app do sistema de referencia
 * (comparacao de 17/11, item 5): o nome do site, quando a inspecao comecou, as
 * observacoes do site, os checklists desta inspecao com a legenda de cores
 * (Finalizado, Agendado, Rascunho) e os botoes "Responder checklist" e
 * "Finalizar inspecao". Os de antes continuam embaixo: agendados e
 * respondidos do local, Converter para Visita e Abandonar Inspecao.
 *
 * "Responder checklist" abre a escolha do tipo, que era a tela inteira antes:
 * o material que a supervisao distribuiu mostra a escolha como uma lista de
 * opcoes, cada uma levando a um formulario proprio. Os dois caminhos pedem
 * coisas diferentes (motivo de um lado, as perguntas do modelo do outro), e
 * o voltar do checklist descarta o formulario e volta para ca.
 *
 * VARIOS CHECKLISTS NA MESMA INSPECAO (0114): depois do envio o checklist
 * volta para ca, e a inspecao segue aberta para outro. "Finalizar inspecao"
 * grava o Termino (o mesmo do "Converter para Visita"), que no banco marca
 * `visitas.finalizada_em`; pede ao menos um checklist enviado e nenhum
 * comecado. Esquecida, a inspecao fecha sozinha a meia-noite.
 */

const DESCRICAO: Record<TipoDeVisita, string> = {
  CORRETIVA: "Informe o motivo da visita, foto e assinatura",
  CONSULTORIA: "Checklist completo, fotos e assinatura",
};

const ICONE: Record<TipoDeVisita, (props: { cor: string }) => React.ReactElement> = {
  CORRETIVA: IconeDeFerramenta,
  CONSULTORIA: IconeDePessoa,
};

const SITUACOES: SituacaoNaInspecao[] = ["FINALIZADO", "AGENDADO", "RASCUNHO"];

export function TelaDeTipoDeVisita({
  visitaId,
  numeroColeta,
  siteId: siteDaRota,
  nomeDoSite,
  retomado = false,
  aoEscolher,
  aoVerAgendados,
  aoVerRespondidos,
  aoConcluir,
}: {
  visitaId: number | null;
  numeroColeta: string;
  siteId: number | null;
  /** O nome que a lista de origem ja tinha; com sinal, vem tambem do servidor. */
  nomeDoSite?: string;
  retomado?: boolean;
  aoEscolher: (tipo: TipoDeVisita) => void;
  aoVerAgendados: (siteId: number) => void;
  aoVerRespondidos: (siteId: number) => void;
  /** Depois de converter, finalizar ou abandonar: volta ao menu. */
  aoConcluir: () => void;
}) {
  // O local da visita: o da rota (QR, "Ver sites") ou, vindo da lista de
  // visitas, o da propria visita no servidor.
  const [siteBuscado, setSiteBuscado] = useState<number | null>(null);
  const siteId = siteDaRota ?? siteBuscado;
  useEffect(() => {
    if (siteDaRota !== null || visitaId === null) return;
    let ativo = true;
    void supabase
      .from("visitas")
      .select("site_id")
      .eq("id", visitaId)
      .maybeSingle()
      .then(({ data }) => {
        if (ativo && data) setSiteBuscado(data.site_id);
      });
    return () => {
      ativo = false;
    };
  }, [siteDaRota, visitaId]);

  const { sessao } = useSessao();
  const funcionarioId = sessao?.user.id ?? null;

  // Nome e observacoes do site, do servidor (sem sinal, fica o nome da rota).
  const [site, setSite] = useState<{ nome: string; observacao: string } | null>(null);
  useEffect(() => {
    if (siteId === null) return;
    let ativo = true;
    void supabase
      .from("sites")
      .select("nome, observacao")
      .eq("id", siteId)
      .maybeSingle()
      .then(({ data }) => {
        if (ativo && data) setSite({ nome: data.nome, observacao: (data.observacao ?? "").trim() });
      });
    return () => {
      ativo = false;
    };
  }, [siteId]);

  // Quando a inspecao comecou: a leitura do QR guardada no aparelho ou, se a
  // visita veio de outro aparelho, a criacao dela no servidor.
  const [iniciadaEm, setIniciadaEm] = useState<string | null>(null);
  useEffect(() => {
    if (visitaId === null) return;
    let ativo = true;
    void (async () => {
      try {
        const banco = await abrirFila();
        const local = await banco.getFirstAsync<{ capturado_em: string }>(
          "select capturado_em from visitas_na_fila where chave = ?",
          numeroColeta,
        );
        if (local) {
          if (ativo) setIniciadaEm(local.capturado_em);
          return;
        }
        const { data } = await supabase.from("visitas").select("criado_em").eq("id", visitaId).maybeSingle();
        if (ativo && data) setIniciadaEm(data.criado_em);
      } catch {
        // Sem hora: a tela so nao mostra o "iniciada em".
      }
    })();
    return () => {
      ativo = false;
    };
  }, [visitaId, numeroColeta]);

  // Os checklists desta inspecao, relidos toda vez que a tela volta ao foco
  // (o voltar do checklist deixa o rascunho atualizado).
  const [itens, setItens] = useState<ItemDaInspecao[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!funcionarioId) return;
      let ativo = true;
      void lerItensDaInspecao({ visitaId, siteId, funcionarioId }).then((lista) => {
        if (ativo) setItens(lista);
      });
      return () => {
        ativo = false;
      };
    }, [visitaId, siteId, funcionarioId]),
  );

  const [escolhendo, setEscolhendo] = useState(retomado);
  const [ocupado, setOcupado] = useState<"converter" | "abandonar" | "finalizar" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const temRascunho = itens?.some((i) => i.situacao === "RASCUNHO") ?? false;
  const finalizados = itens?.filter((i) => i.situacao === "FINALIZADO").length ?? 0;

  // "Converter para Visita" e "Abandonar Inspecao", o menu da inspecao aberta
  // do app de referencia (regras em `campo/acoes-da-visita.ts`).
  const converter = () => {
    if (visitaId === null) return;
    Alert.alert(
      "Converter para Visita",
      "A inspeção vira uma visita simples: fica registrada a presença, com o término agora, sem checklist.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Converter",
          onPress: async () => {
            setOcupado("converter");
            const resultado = await converterParaVisita({ visitaId, numeroColeta });
            setOcupado(null);
            if (resultado.ok) aoConcluir();
            else setErro(resultado.erro);
          },
        },
      ],
    );
  };

  const finalizar = () => {
    if (visitaId === null) return;
    if (temRascunho) {
      Alert.alert("Finalizar inspeção", "Há um checklist começado e não enviado. Envie ou abandone antes de finalizar.");
      return;
    }
    if (finalizados === 0) {
      Alert.alert(
        "Finalizar inspeção",
        "Responda ao menos um checklist para finalizar. Para registrar só a presença, use Converter para Visita.",
      );
      return;
    }
    Alert.alert("Finalizar inspeção", "A inspeção será encerrada agora, com o término registrado.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Finalizar",
        onPress: async () => {
          setOcupado("finalizar");
          // O mesmo Termino do "Converter para Visita" (`acoes-da-visita.ts`).
          const resultado = await converterParaVisita({ visitaId, numeroColeta });
          setOcupado(null);
          if (resultado.ok) aoConcluir();
          else setErro("Não foi possível finalizar a inspeção. Tente de novo com sinal.");
        },
      },
    ]);
  };

  const abandonar = () => {
    Alert.alert(
      "Abandonar Inspeção",
      "A inspeção aberta e o checklist começado serão descartados. Não dá para desfazer.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Abandonar",
          style: "destructive",
          onPress: async () => {
            setOcupado("abandonar");
            const resultado = await abandonarInspecao({ visitaId, numeroColeta, siteId });
            setOcupado(null);
            if (resultado.ok) aoConcluir();
            else setErro(resultado.erro);
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={estilos.raiz} contentContainerStyle={estilos.conteudo}>
      <Text style={estilos.titulo}>{site?.nome ?? nomeDoSite ?? tituloDaColeta(visitaId)}</Text>
      <Text style={estilos.subtitulo}>
        {tituloDaColeta(visitaId)}
        {iniciadaEm ? ` · Inspeção iniciada em ${dataEHoraDaInspecao(iniciadaEm)}` : ""}
      </Text>

      {retomado ? (
        <Aviso
          tom="sucesso"
          mensagem="Este site tem um checklist começado e não enviado. Escolha o mesmo tipo para continuar de onde parou."
        />
      ) : null}

      {site?.observacao ? (
        <View style={estilos.observacao}>
          <Text style={estilos.rotuloDaSecao}>Observações do site</Text>
          <Text style={estilos.textoDaObservacao}>{site.observacao}</Text>
        </View>
      ) : null}

      <Text style={estilos.rotuloDaSecao}>Checklists desta inspeção</Text>
      <View style={estilos.legenda} accessibilityLabel="Legenda: Finalizado, Agendado, Rascunho">
        {SITUACOES.map((s) => (
          <View key={s} style={estilos.itemDaLegenda}>
            <View style={[estilos.bolinha, { backgroundColor: COR_DA_SITUACAO[s].fundo }]} />
            <Text style={estilos.textoDaLegenda}>{ROTULO_DA_SITUACAO[s]}</Text>
          </View>
        ))}
      </View>
      {itens === null ? null : itens.length === 0 ? (
        <Text style={estilos.vazio}>Nenhum checklist nesta inspeção ainda.</Text>
      ) : (
        itens.map((item) => {
          const cor = COR_DA_SITUACAO[item.situacao];
          const continuar = item.situacao === "RASCUNHO" && item.tipo;
          return (
            <Pressable
              key={item.chave}
              disabled={!continuar}
              onPress={() => item.tipo && aoEscolher(item.tipo)}
              accessibilityRole={continuar ? "button" : "text"}
              accessibilityLabel={`${ROTULO_DA_SITUACAO[item.situacao]}: ${item.titulo}. ${item.detalhe}`}
              style={({ pressed }) => [estilos.checklist, { borderLeftColor: cor.fundo }, pressed && estilos.opcaoPressionada]}
            >
              <View style={estilos.textos}>
                <Text style={estilos.rotulo}>{item.titulo}</Text>
                <Text style={estilos.descricao}>{item.detalhe}</Text>
              </View>
              <View style={[estilos.selo, { backgroundColor: cor.fundo }]}>
                <Text style={[estilos.textoDoSelo, { color: cor.texto }]}>{ROTULO_DA_SITUACAO[item.situacao]}</Text>
              </View>
            </Pressable>
          );
        })
      )}

      <View style={estilos.acoes}>
        <Botao
          titulo={escolhendo ? "Fechar a escolha" : "Responder checklist"}
          variante={escolhendo ? "secundaria" : "primaria"}
          larguraTotal
          aoPressionar={() => setEscolhendo((e) => !e)}
        />
      </View>

      {escolhendo ? <Text style={estilos.subtitulo}>Selecione o tipo de visita</Text> : null}

      {(escolhendo ? TIPOS_DE_VISITA : []).map((tipo, indice) => {
        const Icone = ICONE[tipo];

        return (
          <Pressable
            key={tipo}
            onPress={() => {
              // Fecha a escolha: o checklist volta para ca depois do envio.
              setEscolhendo(false);
              aoEscolher(tipo);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${ROTULO_DO_TIPO[tipo]}. ${DESCRICAO[tipo]}`}
            // Cartao inteiro como alvo de toque, e nao so o texto: o aparelho
            // e usado em pe, as vezes com luva.
            style={({ pressed }) => [estilos.opcao, pressed && estilos.opcaoPressionada]}
          >
            <View style={estilos.marca}>
              <Icone cor={cores.primaria} />
            </View>

            <View style={estilos.textos}>
              <Text style={estilos.rotulo}>
                {indice + 1}. {ROTULO_DO_TIPO[tipo]}
              </Text>
              <Text style={estilos.descricao}>{DESCRICAO[tipo]}</Text>
            </View>

            <IconeDeSeta cor={cores.textoFraco} />
          </Pressable>
        );
      })}

      {visitaId !== null ? (
        <View style={estilos.acoes}>
          <Botao
            titulo="Finalizar inspeção"
            variante="secundaria"
            larguraTotal
            carregando={ocupado === "finalizar"}
            desabilitado={ocupado !== null}
            aoPressionar={finalizar}
          />
        </View>
      ) : null}

      {siteId !== null ? (
        <View style={estilos.acoes}>
          <Botao titulo="Checklists agendados" variante="secundaria" larguraTotal aoPressionar={() => aoVerAgendados(siteId)} />
          <Botao
            titulo="Checklists respondidos"
            variante="secundaria"
            larguraTotal
            aoPressionar={() => aoVerRespondidos(siteId)}
          />
        </View>
      ) : null}

      {erro ? <Aviso mensagem={erro} /> : null}

      {/* Com checklist enviado, a inspecao so termina no Finalizar: converter
          (so a presenca) e abandonar (apagar) deixam de fazer sentido, e o
          banco recusa abandonar inspecao com checklist (0088). */}
      {finalizados === 0 ? (
      <View style={estilos.acoes}>
        {visitaId !== null ? (
          <Botao
            titulo="Converter para Visita"
            variante="secundaria"
            larguraTotal
            carregando={ocupado === "converter"}
            desabilitado={ocupado !== null}
            aoPressionar={converter}
          />
        ) : null}
        <Botao
          titulo="Abandonar Inspeção"
          variante="perigo"
          larguraTotal
          carregando={ocupado === "abandonar"}
          desabilitado={ocupado !== null}
          aoPressionar={abandonar}
        />
      </View>
      ) : null}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { ...colunaDeLeitura, padding: espaco.interno, gap: espaco.entreItens },

  titulo: texto(tipografia.titulo, { cor: cores.texto }),
  subtitulo: {
    ...texto(tipografia.apoio, { cor: cores.textoFraco }),
    marginBottom: espaco.minimo,
  },

  rotuloDaSecao: {
    ...texto(tipografia.nota, { cor: cores.textoFraco }),
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: espaco.minimo,
  },
  observacao: {
    backgroundColor: cores.superficie,
    borderRadius: raio.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: espaco.interno,
    gap: espaco.minimo,
  },
  textoDaObservacao: texto(tipografia.apoio, { cor: cores.texto }),

  legenda: { flexDirection: "row", flexWrap: "wrap", gap: espaco.entreItens },
  itemDaLegenda: { flexDirection: "row", alignItems: "center", gap: 6 },
  bolinha: { width: 10, height: 10, borderRadius: 5 },
  textoDaLegenda: texto(tipografia.nota, { cor: cores.textoFraco }),
  vazio: texto(tipografia.apoio, { cor: cores.textoFraco }),

  checklist: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.entreItens,
    backgroundColor: cores.superficie,
    borderRadius: raio.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
    borderLeftWidth: 4,
    padding: espaco.interno,
  },
  selo: { borderRadius: raio.pilula, paddingHorizontal: 10, paddingVertical: 3 },
  textoDoSelo: texto(tipografia.nota, { cor: cores.texto }),

  opcao: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.entreItens,
    backgroundColor: cores.superficie,
    borderRadius: raio.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: espaco.interno,
  },
  opcaoPressionada: { borderColor: cores.primaria, opacity: 0.9 },

  // Disco navy sobre a superficie, a mesma inversao do `EstadoVazio`: e o que
  // faz o icone assentar em vez de flutuar solto ao lado do texto.
  marca: { backgroundColor: cores.fundo, borderRadius: raio.pilula, padding: espaco.entreItens },

  textos: { flex: 1, gap: 2 },
  rotulo: texto(tipografia.destaque, { cor: cores.texto }),
  descricao: texto(tipografia.nota, { cor: cores.textoFraco }),

  acoes: { gap: espaco.minimo, marginTop: espaco.entreItens },
});
