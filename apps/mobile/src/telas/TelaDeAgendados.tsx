import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { Aviso } from "../componentes/Aviso";
import { EsqueletoDaLista } from "../componentes/Esqueleto";
import { EstadoVazio } from "../componentes/EstadoVazio";
import {
  dataBr,
  lerAgendamentos,
  PERIODOS,
  ROTULO_DO_STATUS,
  type Agendamento,
  type Periodo,
  type StatusDoAgendamento,
} from "../lib/agendados-e-respondidos";
import { colunaDeLeitura, cores, espaco, raio, texto, tipografia } from "../tema";

/**
 * "Checklists agendados", como no app do sistema de referencia: os
 * agendamentos das agendas do portal (ChecklistLab › Criar Agenda) no periodo,
 * com a legenda de cores. Aberta de dentro de uma inspecao, mostra so os do
 * local (`siteId`).
 *
 * Antes (ate 03/11/2026) era um estado vazio: o banco nao tinha agenda. Com a
 * 0084 no portal e a 0088 liberando a leitura para o campo, a lista e real.
 */

/** Cores da legenda; texto escuro sobre o amarelo para contraste. */
export const COR_DO_STATUS: Record<StatusDoAgendamento, { fundo: string; texto: string }> = {
  FINALIZADO: { fundo: "#16a34a", texto: "#ffffff" },
  AGENDADO: { fundo: "#eab308", texto: "#1f2937" },
  NO_PRAZO: { fundo: "#2563eb", texto: "#ffffff" },
  ATRASADO: { fundo: "#dc2626", texto: "#ffffff" },
};

export function SeloDoStatus({ status }: { status: StatusDoAgendamento }) {
  const cor = COR_DO_STATUS[status];
  return (
    <View style={[estilos.selo, { backgroundColor: cor.fundo }]}>
      <Text style={[estilos.seloTexto, { color: cor.texto }]}>{ROTULO_DO_STATUS[status]}</Text>
    </View>
  );
}

export function TelaDeAgendados({ siteId = null }: { siteId?: number | null }) {
  const [periodo, setPeriodo] = useState<Periodo>("proximos7");
  const [lista, setLista] = useState<Agendamento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(
    async (escolhido: Periodo) => {
      const resultado = await lerAgendamentos(escolhido, siteId);
      if (resultado.ok) {
        setLista(resultado.lista);
        setErro(null);
      } else {
        setLista((atual) => atual ?? []);
        setErro(resultado.erro);
      }
    },
    [siteId],
  );

  useEffect(() => {
    let ativo = true;
    void lerAgendamentos(periodo, siteId).then((resultado) => {
      if (!ativo) return;
      if (resultado.ok) {
        setLista(resultado.lista);
        setErro(null);
      } else {
        setLista([]);
        setErro(resultado.erro);
      }
    });
    return () => {
      ativo = false;
    };
  }, [periodo, siteId]);

  const atualizar = async () => {
    setAtualizando(true);
    await carregar(periodo);
    setAtualizando(false);
  };

  return (
    <View style={estilos.raiz}>
      <View style={estilos.topo}>
        <View style={estilos.periodos} accessibilityRole="radiogroup" accessibilityLabel="Período">
          {PERIODOS.map((p) => {
            const escolhido = p.valor === periodo;
            return (
              <Pressable
                key={p.valor}
                onPress={() => {
                  setLista(null);
                  setPeriodo(p.valor);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: escolhido }}
                style={[estilos.periodo, escolhido && estilos.periodoEscolhido]}
              >
                <Text style={[estilos.periodoTexto, escolhido && estilos.periodoTextoEscolhido]}>{p.rotulo}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={estilos.legenda}>
          <Text style={estilos.legendaRotulo}>Legenda:</Text>
          {(Object.keys(COR_DO_STATUS) as StatusDoAgendamento[]).map((s) => (
            <SeloDoStatus key={s} status={s} />
          ))}
        </View>
        {erro ? <Aviso mensagem={erro} /> : null}
      </View>

      {lista === null ? (
        <View style={estilos.conteudo}>
          <EsqueletoDaLista />
        </View>
      ) : (
        <FlatList
          data={lista}
          keyExtractor={(item) => item.chave}
          contentContainerStyle={[estilos.conteudo, lista.length === 0 && estilos.vazio]}
          refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} />}
          ListEmptyComponent={
            erro ? undefined : (
              <EstadoVazio
                titulo="Não há checklists para mostrar."
                descricao="Nenhum agendamento no período escolhido. Os agendamentos vêm das agendas do portal."
              />
            )
          }
          renderItem={({ item }) => (
            <View
              style={estilos.item}
              accessible
              accessibilityLabel={`${item.modelo}, ${item.site}, ${dataBr(item.dataPlanejada)}, ${ROTULO_DO_STATUS[item.status]}`}
            >
              <View style={estilos.itemTopo}>
                <Text style={estilos.itemTitulo}>{item.modelo}</Text>
                <SeloDoStatus status={item.status} />
              </View>
              {siteId === null ? <Text style={estilos.itemTexto}>{item.site}</Text> : null}
              <Text style={estilos.itemApoio}>
                Data planejada {dataBr(item.dataPlanejada)} · prazo {dataBr(item.prazo)}
              </Text>
              <Text style={estilos.itemApoio}>Agenda: {item.agenda}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  topo: { ...colunaDeLeitura, paddingHorizontal: espaco.interno, paddingTop: espaco.interno, gap: espaco.minimo },
  periodos: { flexDirection: "row", flexWrap: "wrap", gap: espaco.minimo },
  periodo: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.pilula,
    paddingHorizontal: espaco.entreItens,
    paddingVertical: espaco.minimo,
  },
  periodoEscolhido: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  periodoTexto: texto(tipografia.apoio, { cor: cores.texto }),
  periodoTextoEscolhido: { color: cores.textoSobrePrimaria },
  legenda: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: espaco.minimo },
  legendaRotulo: texto(tipografia.apoio, { cor: cores.textoFraco }),
  selo: { borderRadius: raio.pilula, paddingHorizontal: espaco.minimo, paddingVertical: 2 },
  seloTexto: texto(tipografia.nota, {}),
  conteudo: { ...colunaDeLeitura, padding: espaco.interno, gap: espaco.entreItens },
  vazio: { flexGrow: 1, justifyContent: "center" },
  item: {
    backgroundColor: cores.superficie,
    borderRadius: raio.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: espaco.interno,
    gap: 4,
  },
  itemTopo: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: espaco.minimo },
  itemTitulo: { ...texto(tipografia.destaque, { cor: cores.texto }), flex: 1 },
  itemTexto: texto(tipografia.apoio, { cor: cores.texto }),
  itemApoio: texto(tipografia.nota, { cor: cores.textoFraco }),
});
