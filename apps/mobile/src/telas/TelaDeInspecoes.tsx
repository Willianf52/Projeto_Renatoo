import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Tables } from "@projeto-renatoo/shared";

import { useSessao } from "../auth/SessaoProvider";
import { supabase } from "../lib/supabase";
import { cores, espaco } from "../tema";

/** Colunas que a lista mostra -- recorte de `visitas` do schema real. */
type VisitaNaLista = Pick<Tables<"visitas">, "id" | "numero_coleta" | "site_id" | "criado_em">;

export function TelaDeInspecoes() {
  const { perfil, sessao, sair } = useSessao();
  const [visitas, setVisitas] = useState<VisitaNaLista[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const idDoUsuario = sessao?.user.id ?? null;

  useEffect(() => {
    if (!idDoUsuario) return;

    // Mesma guarda do SessaoProvider: resposta que chega depois do logout (ou
    // de outro usuario entrar) nao pode pintar a lista do inspetor anterior.
    let ativo = true;

    lerVisitas(idDoUsuario).then((resultado) => {
      if (!ativo) return;
      setVisitas(resultado.visitas);
      setErro(resultado.erro);
      setCarregando(false);
    });

    return () => {
      ativo = false;
    };
  }, [idDoUsuario]);

  // Chamado pelo gesto de puxar, nao por effect -- aqui o setState direto e
  // legitimo, e a lista antiga fica na tela enquanto a nova nao chega.
  const puxarParaAtualizar = useCallback(async () => {
    if (!idDoUsuario) return;

    setAtualizando(true);

    const resultado = await lerVisitas(idDoUsuario);
    setVisitas(resultado.visitas);
    setErro(resultado.erro);
    setAtualizando(false);
  }, [idDoUsuario]);

  const nome = perfil?.nome_completo?.trim() || perfil?.email || "Inspetor";

  return (
    <View style={estilos.raiz}>
      <View style={estilos.cabecalho}>
        <View style={estilos.cabecalhoTexto}>
          <Text style={estilos.saudacao} numberOfLines={1}>
            {nome}
          </Text>
          <Text style={estilos.cargo}>{perfil?.cargo}</Text>
        </View>
        <Pressable
          onPress={sair}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [estilos.sair, pressed && estilos.sairPressionado]}
        >
          <Text style={estilos.sairTexto}>Sair</Text>
        </Pressable>
      </View>

      {carregando ? (
        <View style={estilos.centro}>
          <ActivityIndicator color={cores.primaria} />
        </View>
      ) : (
        <FlatList
          data={visitas}
          keyExtractor={(visita) => String(visita.id)}
          contentContainerStyle={
            visitas.length === 0 ? estilos.listaVazia : estilos.lista
          }
          refreshControl={
            <RefreshControl
              refreshing={atualizando}
              onRefresh={() => {
                void puxarParaAtualizar();
              }}
            />
          }
          ListHeaderComponent={
            erro ? (
              <View style={estilos.erro}>
                <Text style={estilos.erroTexto}>{erro}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            erro ? null : (
              <View style={estilos.centro}>
                <Text style={estilos.vazioTitulo}>Nenhuma visita registrada</Text>
                <Text style={estilos.vazioTexto}>
                  As visitas que você registrar em campo aparecem aqui.
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <View style={estilos.cartao}>
              <Text style={estilos.cartaoTitulo}>Coleta {item.numero_coleta}</Text>
              <Text style={estilos.cartaoDetalhe}>
                Site {item.site_id} · {formatarData(item.criado_em)}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

/**
 * Fora do componente e sem `setState` -- devolve o que leu. Ver a nota em
 * `SessaoProvider`: e o que mantem o effect livre de render em cascata.
 */
async function lerVisitas(
  idDoUsuario: string,
): Promise<{ visitas: VisitaNaLista[]; erro: string | null }> {
  // `funcionario_id = auth.uid()` e o ramo da policy "Leitura da operacao no
  // escopo" (0014, revisada na 0029) que atende um INSPETOR ativo. O filtro
  // aqui repete a condicao de proposito: sem ele o PostgREST pediria a tabela
  // inteira e deixaria o RLS peneirar -- mesmo resultado, muito mais banco.
  const { data, error } = await supabase
    .from("visitas")
    .select("id, numero_coleta, site_id, criado_em")
    .eq("funcionario_id", idDoUsuario)
    .order("criado_em", { ascending: false })
    .limit(20);

  if (error) {
    return { visitas: [], erro: "Não foi possível carregar suas visitas." };
  }

  return { visitas: data ?? [], erro: null };
}

/**
 * `criado_em` chega em UTC (o banco guarda timestamptz). A conversao para o
 * fuso do aparelho e feita aqui, na borda de exibicao -- o dado em si nunca
 * e reescrito, que e a regra que `normalizarInstante` do shared protege do
 * outro lado.
 */
function formatarData(iso: string): string {
  const data = new Date(iso);

  if (Number.isNaN(data.getTime())) return "data inválida";

  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  cabecalho: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: espaco.g,
    paddingVertical: espaco.m,
    backgroundColor: cores.superficie,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
  },
  cabecalhoTexto: { flex: 1, marginRight: espaco.m },
  saudacao: { fontSize: 17, fontWeight: "700", color: cores.texto },
  cargo: { fontSize: 13, color: cores.textoFraco, marginTop: 2 },
  sair: { paddingHorizontal: espaco.m, paddingVertical: espaco.p },
  sairPressionado: { opacity: 0.6 },
  sairTexto: { color: cores.primaria, fontSize: 15, fontWeight: "600" },
  lista: { padding: espaco.g, gap: espaco.m },
  listaVazia: { flexGrow: 1, padding: espaco.g },
  centro: { flex: 1, alignItems: "center", justifyContent: "center", padding: espaco.g },
  vazioTitulo: { fontSize: 16, fontWeight: "600", color: cores.texto },
  vazioTexto: {
    fontSize: 14,
    color: cores.textoFraco,
    textAlign: "center",
    marginTop: espaco.p,
  },
  cartao: {
    backgroundColor: cores.superficie,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: espaco.m,
  },
  cartaoTitulo: { fontSize: 16, fontWeight: "600", color: cores.texto },
  cartaoDetalhe: { fontSize: 13, color: cores.textoFraco, marginTop: 4 },
  erro: {
    backgroundColor: cores.erroFundo,
    borderRadius: 10,
    padding: espaco.m,
    marginBottom: espaco.m,
  },
  erroTexto: { color: cores.erroTexto, fontSize: 14 },
});
