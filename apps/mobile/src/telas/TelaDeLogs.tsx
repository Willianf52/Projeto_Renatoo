import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Share, StyleSheet, Text, View } from "react-native";
import * as Updates from "expo-updates";

import { useSessao } from "../auth/SessaoProvider";
import {
  apagarLogsEnviados,
  lerLogs,
  ROTULO_DO_LOG,
  textoParaCompartilhar,
  type LogDeEnvio,
  type StatusDoLog,
} from "../campo/logs-de-envio";
import { ultimaSincronizacao } from "../campo/fila";
import { inicioDoDia } from "../campo/rascunho";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { EstadoVazio } from "../componentes/EstadoVazio";
import { colunaDeLeitura, cores, espaco, raio, texto, tipografia } from "../tema";
import app from "../../app.json";

/**
 * "Logs de envio de dados" e "Compartilhar dados", do menu do app do sistema
 * de referencia (regras em `campo/logs-de-envio.ts`).
 */

type Filtro = "TODOS" | StatusDoLog;

const COR: Record<StatusDoLog, string> = { SUCESSO: "#16a34a", PENDENTE: "#eab308", ERRO: "#dc2626" };

function dataEHora(valor: string): string {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return valor;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function TelaDeLogs() {
  const { perfil, sessao } = useSessao();
  const idDoUsuario = sessao?.user.id ?? null;
  const [logs, setLogs] = useState<LogDeEnvio[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("TODOS");
  const [aberto, setAberto] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ mensagem: string; tom: "erro" | "sucesso" } | null>(null);

  const carregar = useCallback(async () => {
    if (!idDoUsuario) return;
    try {
      setLogs(await lerLogs(idDoUsuario));
    } catch {
      setLogs([]);
      setAviso({ mensagem: "Não foi possível ler os logs deste aparelho.", tom: "erro" });
    }
  }, [idDoUsuario]);

  useEffect(() => {
    if (!idDoUsuario) return;
    let ativo = true;
    lerLogs(idDoUsuario)
      .then((lidos) => {
        if (ativo) setLogs(lidos);
      })
      .catch(() => {
        if (ativo) setLogs([]);
      });
    return () => {
      ativo = false;
    };
  }, [idDoUsuario]);

  const contagem = useMemo(() => {
    const lista = logs ?? [];
    return {
      TODOS: lista.length,
      SUCESSO: lista.filter((l) => l.status === "SUCESSO").length,
      PENDENTE: lista.filter((l) => l.status === "PENDENTE").length,
      ERRO: lista.filter((l) => l.status === "ERRO").length,
    } satisfies Record<Filtro, number>;
  }, [logs]);

  const visiveis = (logs ?? []).filter((l) => filtro === "TODOS" || l.status === filtro);

  const apagar = () => {
    if (!idDoUsuario) return;
    Alert.alert(
      "Apagar logs",
      "Apaga do aparelho os envios com sucesso de antes de hoje. Pendentes e com erro ficam.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Apagar",
          style: "destructive",
          onPress: async () => {
            try {
              const quantos = await apagarLogsEnviados(idDoUsuario, inicioDoDia());
              setAviso({ mensagem: `${quantos} log(s) apagado(s).`, tom: "sucesso" });
            } catch {
              setAviso({ mensagem: "Não foi possível apagar os logs.", tom: "erro" });
            }
            await carregar();
          },
        },
      ],
    );
  };

  const compartilhar = async () => {
    const sincronizadoEm = await ultimaSincronizacao().catch(() => null);
    const atualizacao = Updates.updateId ? Updates.updateId.slice(0, 8) : null;
    await Share.share({
      message: textoParaCompartilhar({
        nome: perfil?.nome_completo?.trim() || perfil?.email || "",
        versao: app.expo.version,
        atualizacao,
        sincronizadoEm: sincronizadoEm ? dataEHora(sincronizadoEm) : null,
        logs: logs ?? [],
      }),
    }).catch(() => undefined);
  };

  return (
    <View style={estilos.raiz}>
      <View style={estilos.topo}>
        <View style={estilos.filtros} accessibilityRole="radiogroup" accessibilityLabel="Situação do envio">
          {(["TODOS", "SUCESSO", "PENDENTE", "ERRO"] as Filtro[]).map((f) => {
            const escolhido = f === filtro;
            return (
              <Pressable
                key={f}
                onPress={() => setFiltro(f)}
                accessibilityRole="radio"
                accessibilityState={{ selected: escolhido }}
                style={[estilos.filtro, escolhido && estilos.filtroEscolhido]}
              >
                <Text style={[estilos.filtroTexto, escolhido && estilos.filtroTextoEscolhido]}>
                  {f === "TODOS" ? "Todos" : ROTULO_DO_LOG[f]} ({contagem[f]})
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={estilos.botoes}>
          <View style={estilos.botao}>
            <Botao
              titulo="Compartilhar dados"
              variante="secundaria"
              larguraTotal
              aoPressionar={() => void compartilhar()}
            />
          </View>
          <View style={estilos.botao}>
            <Botao titulo={`Apagar logs (${contagem.SUCESSO})`} variante="perigo" larguraTotal aoPressionar={apagar} />
          </View>
        </View>
        {aviso ? <Aviso mensagem={aviso.mensagem} tom={aviso.tom} /> : null}
      </View>

      <FlatList
        data={visiveis}
        keyExtractor={(item) => item.chave}
        contentContainerStyle={[estilos.conteudo, visiveis.length === 0 && estilos.vazio]}
        ListEmptyComponent={
          logs === null ? undefined : (
            <EstadoVazio titulo="Nenhum envio" descricao="Os envios deste aparelho aparecem aqui." />
          )
        }
        renderItem={({ item }) => {
          const expandido = aberto === item.chave;
          return (
            <Pressable
              onPress={() => setAberto(expandido ? null : item.chave)}
              accessibilityRole="button"
              accessibilityState={{ expanded: expandido }}
              style={estilos.item}
            >
              <View style={estilos.itemTopo}>
                <View style={[estilos.selo, { backgroundColor: COR[item.status] }]}>
                  <Text style={estilos.seloTexto}>{ROTULO_DO_LOG[item.status]}</Text>
                </View>
                <Text style={estilos.itemApoio}>{dataEHora(item.capturadoEm)}</Text>
              </View>
              <Text style={estilos.itemTitulo}>{item.termino ? "Visita com término" : "Início de visita"}</Text>
              <Text style={estilos.itemApoio}>Tentativas: {item.tentativas}</Text>
              {expandido ? (
                <View style={estilos.detalhes}>
                  <Text style={estilos.itemApoio}>Número da coleta: {item.chave}</Text>
                  <Text style={estilos.itemApoio}>Site: {item.siteId}</Text>
                  <Text style={estilos.itemApoio}>Visita no servidor: {item.visitaId ?? "ainda não enviada"}</Text>
                  <Text style={estilos.itemApoio}>
                    Leituras: {item.leituras} ({item.leiturasPendentes} pendente(s))
                  </Text>
                  {item.ultimoErro ? <Text style={estilos.erro}>Último erro: {item.ultimoErro}</Text> : null}
                </View>
              ) : (
                <Text style={estilos.verDetalhes}>Ver detalhes</Text>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  topo: { ...colunaDeLeitura, paddingHorizontal: espaco.interno, paddingTop: espaco.interno, gap: espaco.minimo },
  filtros: { flexDirection: "row", flexWrap: "wrap", gap: espaco.minimo },
  filtro: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.pilula,
    paddingHorizontal: espaco.entreItens,
    paddingVertical: espaco.minimo,
  },
  filtroEscolhido: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  filtroTexto: texto(tipografia.apoio, { cor: cores.texto }),
  filtroTextoEscolhido: { color: cores.textoSobrePrimaria },
  botoes: { flexDirection: "row", gap: espaco.minimo },
  botao: { flex: 1 },
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
  itemTitulo: texto(tipografia.destaque, { cor: cores.texto }),
  itemApoio: texto(tipografia.nota, { cor: cores.textoFraco }),
  selo: { borderRadius: raio.pilula, paddingHorizontal: espaco.minimo, paddingVertical: 2 },
  seloTexto: texto(tipografia.nota, { cor: "#ffffff" }),
  detalhes: { gap: 2, marginTop: espaco.rotulo },
  erro: texto(tipografia.nota, { cor: cores.erroTextoDeCampo }),
  verDetalhes: texto(tipografia.nota, { cor: cores.primaria }),
});
