import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { abrirFila } from "../campo/fila";
import { motivoParaNaoAbrir, novoNumeroDeColeta, type SiteParaVisita } from "../campo/visita-pelo-site";
import { Aviso } from "../componentes/Aviso";
import { Campo } from "../componentes/Campo";
import { EsqueletoDaLista } from "../componentes/Esqueleto";
import { EstadoVazio } from "../componentes/EstadoVazio";
import { colunasParaLargura, larguraDoItemNaGrade } from "../lib/grade";
import { capturarErro } from "../lib/observabilidade";
import { supabase } from "../lib/supabase";
import type { RotasDoApp } from "../navegacao/Navegacao";
import { colunaDeLeitura, cores, espaco, raio, texto, tipografia } from "../tema";

type Navegador = NativeStackNavigationProp<RotasDoApp>;

/**
 * "Ver sites": todos os sites cadastrados. Aberta pelo botao embaixo da camera
 * da ronda (pedido do dono, 28/09/2026), no lugar do campo de digitar o codigo.
 * Cada site mostra SO O NOME, tambem a pedido do dono -- a busca, por isso,
 * procura so no nome.
 *
 * TOCAR NO SITE VAI DIRETO PARA O CHECKLIST (28/09/2026), passando pela
 * escolha do tipo, como a ronda por QR faz ao encerrar. O toque nao grava nada:
 * a visita so e criada no envio do checklist (`campo/visita-pelo-site.ts`), e
 * voltar sem enviar nao deixa visita vazia no banco. Por isso tambem nao ha
 * confirmacao -- um toque sem querer se desfaz com o voltar.
 *
 * Com rede, a lista vem do servidor -- o recorte e o do RLS
 * (`pode_ver_grupo_site`): INSPETOR e GESTOR enxergam todos. Sem rede, cai para
 * os sites que o catalogo de QR guardado no aparelho conhece, com aviso -- o
 * checklist abre e o rascunho e guardado, mas o envio precisa de internet.
 */
export function TelaDeSites() {
  const navegacao = useNavigation<Navegador>();
  // Duas colunas no tablet: a lista sao so nomes, e numa coluna de 700 dp
  // cada nome ocupava uma linha inteira para meia duzia de letras.
  const { width: larguraDaJanela } = useWindowDimensions();
  const colunas = colunasParaLargura(larguraDaJanela);
  const larguraDoItem = larguraDoItemNaGrade(larguraDaJanela, {
    respiro: espaco.interno,
    vao: espaco.minimo,
  });
  const [sites, setSites] = useState<SiteParaVisita[] | null>(null);
  const [soDoAparelho, setSoDoAparelho] = useState(false);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    lerSites()
      .then((resultado) => {
        if (!ativo) return;
        setSites(resultado.sites);
        setSoDoAparelho(resultado.soDoAparelho);
      })
      .catch((falha) => {
        capturarErro(falha, { onde: "lerSites" });
        if (ativo) setSites([]);
      });

    return () => {
      ativo = false;
    };
  }, []);

  const filtrados = useMemo(() => {
    if (!sites) return null;
    const termo = normalizar(busca);
    if (!termo) return sites;
    return sites.filter((s) => normalizar(s.nome).includes(termo));
  }, [sites, busca]);

  const abrir = useCallback(
    (site: SiteParaVisita) => {
      const motivo = motivoParaNaoAbrir(site);
      if (motivo) {
        setErro(motivo);
        return;
      }
      setErro(null);
      navegacao.navigate("TipoDeVisita", { visitaId: null, site, numeroColeta: novoNumeroDeColeta() });
    },
    [navegacao],
  );

  return (
    <View style={estilos.raiz}>
      <View style={estilos.topo}>
        <Campo
          rotulo="Buscar site"
          valor={busca}
          aoMudar={setBusca}
          placeholder="Nome do site"
          autoCorrect={false}
          returnKeyType="search"
        />
        {soDoAparelho ? (
          <Aviso
            estilo={estilos.aviso}
            mensagem="Sem conexão: mostrando só os sites com QR code guardados no aparelho."
          />
        ) : null}
        {erro ? <Aviso estilo={estilos.aviso} mensagem={erro} /> : null}
      </View>

      {filtrados === null ? (
        <View style={estilos.lista}>
          <EsqueletoDaLista />
        </View>
      ) : (
        <FlatList
          // `numColumns` nao pode mudar com a lista montada: a chave remonta
          // quando o aparelho gira e a grade troca de uma para duas colunas.
          key={colunas}
          numColumns={colunas}
          columnWrapperStyle={colunas > 1 ? estilos.linhaDaGrade : undefined}
          data={filtrados}
          keyExtractor={(site) => String(site.id)}
          contentContainerStyle={filtrados.length === 0 ? estilos.vazia : estilos.lista}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <EstadoVazio
              titulo={busca ? "Nenhum site encontrado" : "Nenhum site cadastrado"}
              descricao={busca ? "Tente outro nome." : "Os sites cadastrados no portal aparecem aqui."}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => abrir(item)}
              accessibilityRole="button"
              accessibilityLabel={`Fazer checklist em ${item.nome}`}
              style={({ pressed }) => [
                estilos.site,
                larguraDoItem !== undefined && { width: larguraDoItem },
                pressed && estilos.pressionado,
              ]}
            >
              <Text style={estilos.nome} numberOfLines={2}>
                {item.nome}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

/** Busca sem diferenciar maiuscula nem acento: "sao paulo" acha "São Paulo". */
function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Fora do componente e sem `setState`, como `lerVisitas` -- ver a nota em
 * `SessaoProvider`. Sao algumas centenas de sites: uma consulta so, abaixo do
 * `max_rows` (1000) do PostgREST. `ativo` e `recebe_visita` vem junto, mas nao
 * aparecem na tela: servem para recusar a visita no toque.
 */
async function lerSites(): Promise<{ sites: SiteParaVisita[]; soDoAparelho: boolean }> {
  try {
    const { data, error } = await supabase
      .from("sites")
      .select("id, nome, ativo, recebe_visita")
      .order("nome");

    if (error) throw error;

    return {
      sites: (data ?? []).map((s) => ({ id: s.id, nome: s.nome, ativo: s.ativo, recebeVisita: s.recebe_visita })),
      soDoAparelho: false,
    };
  } catch {
    const banco = await abrirFila();
    const linhas = await banco.getAllAsync<{ site_id: number; site_nome: string }>(
      "select distinct site_id, site_nome from catalogo_de_qr order by site_nome",
    );
    return {
      sites: linhas.map((l) => ({ id: l.site_id, nome: l.site_nome, ativo: true, recebeVisita: true })),
      soDoAparelho: true,
    };
  }
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  topo: { ...colunaDeLeitura, padding: espaco.interno, paddingBottom: espaco.minimo, gap: espaco.entreItens },
  aviso: { marginTop: 0 },
  lista: { ...colunaDeLeitura, padding: espaco.interno, paddingTop: espaco.minimo, gap: espaco.minimo },
  linhaDaGrade: { gap: espaco.minimo },
  vazia: { flexGrow: 1, justifyContent: "center", padding: espaco.confortavel },
  site: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.minimo,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.cartao,
    padding: espaco.interno,
  },
  pressionado: { opacity: 0.7 },
  nome: { ...texto(tipografia.apoioMedio, { cor: cores.texto }), flex: 1 },
});
