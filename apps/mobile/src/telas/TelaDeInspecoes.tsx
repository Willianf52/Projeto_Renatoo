import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CARGO_INSPETOR, type Tables } from "@projeto-renatoo/shared";

import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useSessao } from "../auth/SessaoProvider";
import type { RotasDoApp } from "../navegacao/Navegacao";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Cartao, LinhaDoCartao } from "../componentes/Cartao";
import { EsqueletoDaLista } from "../componentes/Esqueleto";
import { EstadoVazio } from "../componentes/EstadoVazio";
import { supabase } from "../lib/supabase";
import { cores, espaco, texto, tipografia } from "../tema";

/** Colunas que a lista mostra -- recorte de `visitas` do schema real. */
type VisitaNaLista = Pick<Tables<"visitas">, "id" | "numero_coleta" | "site_id" | "criado_em">;

export function TelaDeInspecoes() {
  const { perfil, sessao, sair } = useSessao();

  /**
   * A pilha roda com `headerShown: false`, entao nao ha header do React
   * Navigation reservando o espaco da barra de status -- sem isto o e-mail do
   * inspetor fica desenhado por baixo do relogio e do icone de bateria.
   * Observado no emulador (Android 16) em 2026-08-26; num aparelho com recorte
   * de camera e pior.
   */
  const bordas = useSafeAreaInsets();
  const navegacao = useNavigation<NativeStackNavigationProp<RotasDoApp>>();
  const [visitas, setVisitas] = useState<VisitaNaLista[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const idDoUsuario = sessao?.user.id ?? null;

  /**
   * O inspetor ve as visitas que ele mesmo registrou; os demais cargos veem o
   * que o RLS entregar para eles. A diferenca esta so no filtro da consulta --
   * o recorte final e o mesmo com ou sem ele.
   */
  const soAsMinhas = perfil?.cargo === CARGO_INSPETOR;

  useEffect(() => {
    if (!idDoUsuario) return;

    // Mesma guarda do SessaoProvider: resposta que chega depois do logout (ou
    // de outro usuario entrar) nao pode pintar a lista do inspetor anterior.
    let ativo = true;

    lerVisitas(idDoUsuario, soAsMinhas)
      .then((resultado) => {
        if (!ativo) return;
        setVisitas(resultado.visitas);
        setErro(resultado.erro);
        setCarregando(false);
      })
      .catch(() => {
        // `lerVisitas` ja traduz erro do PostgREST; o que falta e a rejeicao
        // da camada de rede. Sem este ramo `carregando` fica preso em `true`
        // e a tela mostra spinner eterno em vez da mensagem de falha.
        if (!ativo) return;
        setErro("Não foi possível carregar suas visitas.");
        setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [idDoUsuario, soAsMinhas]);

  // Chamado pelo gesto de puxar, nao por effect -- aqui o setState direto e
  // legitimo, e a lista antiga fica na tela enquanto a nova nao chega.
  const puxarParaAtualizar = useCallback(async () => {
    if (!idDoUsuario) return;

    setAtualizando(true);

    const resultado = await lerVisitas(idDoUsuario, soAsMinhas);
    setVisitas(resultado.visitas);
    setErro(resultado.erro);
    setAtualizando(false);
  }, [idDoUsuario, soAsMinhas]);

  const nome = perfil?.nome_completo?.trim() || perfil?.email || "Sem nome";

  return (
    <View style={estilos.raiz}>
      <View style={[estilos.cabecalho, { paddingTop: bordas.top + espaco.entreItens }]}>
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
        <EsqueletoDaLista />
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
              // O controle de puxar-para-atualizar nao herda o tema: sem estas
              // tres, o Android desenha um disco branco com risco cinza em
              // cima do navy, e o iOS um spinner cinza-claro quase invisivel.
              tintColor={cores.primaria}
              colors={[cores.primaria]}
              progressBackgroundColor={cores.superficie}
            />
          }
          ListHeaderComponent={erro ? <Aviso mensagem={erro} estilo={estilos.aviso} /> : null}
          ListEmptyComponent={
            erro ? null : (
              <View style={estilos.centro}>
                <EstadoVazio
                  titulo="Nenhuma visita registrada"
                  descricao={
                    soAsMinhas
                      ? "As visitas que você registrar em campo aparecem aqui."
                      : "As visitas registradas pela equipe em campo aparecem aqui."
                  }
                />
              </View>
            )
          }
          /* A tabela de coletas do painel tem uma coluna por campo; num
             celular as colunas viram linhas rotuladas dentro do cartao, uma
             embaixo da outra. O rotulo e o mesmo do `<thead>` de la, com a
             mesma tipografia -- e o que permite conferir os dois lado a lado
             sem traduzir nome de campo na cabeca. */
          renderItem={({ item }) => (
            <Cartao>
              <Text style={estilos.cartaoTitulo}>Coleta {item.numero_coleta}</Text>
              <LinhaDoCartao rotulo="Site" valor={String(item.site_id)} />
              <LinhaDoCartao rotulo="Registrada em" valor={formatarData(item.criado_em)} />

              {/* So o inspetor fecha visita: os demais cargos leem esta lista
                  pelo painel e nao teriam o que fazer com o botao. O portao de
                  verdade continua sendo a policy da 0042 -- isto aqui e para
                  nao oferecer o que o banco vai recusar. */}
              {soAsMinhas ? (
                <Botao
                  titulo="Finalizar visita"
                  variante="secundaria"
                  tamanho="medio"
                  larguraTotal
                  estilo={estilos.finalizar}
                  aoPressionar={() =>
                    navegacao.navigate("Checklist", {
                      visitaId: item.id,
                      numeroColeta: item.numero_coleta,
                    })
                  }
                />
              ) : null}
            </Cartao>
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
  soAsMinhas: boolean,
): Promise<{ visitas: VisitaNaLista[]; erro: string | null }> {
  const consulta = supabase.from("visitas").select("id, numero_coleta, site_id, criado_em");

  // `funcionario_id = auth.uid()` e o ramo da policy "Leitura da operacao no
  // escopo" (0014, revisada na 0029) que atende um INSPETOR ativo. O filtro
  // aqui repete a condicao de proposito: sem ele o PostgREST pediria a tabela
  // inteira e deixaria o RLS peneirar -- mesmo resultado, muito mais banco.
  //
  // Para os outros cargos nao ha o que repetir: os ramos que os atendem sao
  // `pode_ver_toda_operacao()` e o de `e_cliente()`, e nenhum dos dois olha
  // para `funcionario_id`. Filtrar por ele aqui devolveria lista vazia a quem
  // nao registra visita -- que e o bug de pedir ao cliente que adivinhe a
  // policy. Sem o filtro, quem nao tem direito a nada recebe zero linha do
  // proprio RLS, que e o resultado certo pelo caminho certo.
  const comEscopo = soAsMinhas ? consulta.eq("funcionario_id", idDoUsuario) : consulta;

  const { data, error } = await comEscopo
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
  // Irma da `DashboardNavbar` do painel: superficie elevada sobre o fundo,
  // separada dele por uma linha slate-800 -- e nao por sombra, que sobre navy
  // nao aparece.
  cabecalho: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: espaco.interno,
    paddingBottom: espaco.entreItens,
    backgroundColor: cores.superficie,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
  },
  cabecalhoTexto: { flex: 1, marginRight: espaco.entreItens },
  saudacao: texto(tipografia.destaque, { cor: cores.texto }),
  cargo: {
    ...texto(tipografia.nota, { cor: cores.textoFraco, caixaAlta: true }),
    letterSpacing: tipografia.rotulo.espacamento,
  },
  sair: { paddingHorizontal: espaco.entreItens, paddingVertical: espaco.minimo },
  sairPressionado: { opacity: 0.6 },
  sairTexto: texto(tipografia.botaoDenso, { cor: cores.primaria }),
  // `gap-3` entre cartoes e `p-4` na moldura: e a grade de filtros do painel
  // no seu caso base (`grid-cols-1`), que e como ela ja se comporta na largura
  // de um celular.
  lista: { padding: espaco.interno, gap: espaco.entreItens },
  listaVazia: { flexGrow: 1, padding: espaco.interno },
  centro: { flex: 1, alignItems: "center", justifyContent: "center", padding: espaco.interno },
  cartaoTitulo: texto(tipografia.destaque, { cor: cores.texto }),
  aviso: { marginBottom: espaco.entreItens },
  finalizar: { marginTop: espaco.interno },
});
