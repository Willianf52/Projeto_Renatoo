import { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { abrirFila } from "../campo/fila";
import { Aviso } from "../componentes/Aviso";
import { Campo } from "../componentes/Campo";
import { EsqueletoDaLista } from "../componentes/Esqueleto";
import { EstadoVazio } from "../componentes/EstadoVazio";
import { capturarErro } from "../lib/observabilidade";
import { supabase } from "../lib/supabase";
import { cores, espaco, raio, texto, tipografia } from "../tema";

type SiteNaLista = { id: number; nome: string };

/**
 * "Ver sites": todos os sites cadastrados, para consulta. Aberta pelo botao
 * embaixo da camera da ronda (pedido do dono, 28/09/2026), no lugar do campo
 * de digitar o codigo. Cada site mostra SO O NOME, tambem a pedido do dono --
 * a busca, por isso, procura so no nome.
 *
 * Com rede, vem do servidor -- o recorte e o do RLS (`pode_ver_grupo_site`):
 * INSPETOR e GESTOR enxergam todos. Sem rede, cai para os sites que o catalogo
 * de QR guardado no aparelho conhece (`campo/ronda.ts`), com aviso: e uma lista
 * menor (so sites com QR cadastrado), mas e melhor que tela vazia em campo.
 */
export function TelaDeSites() {
  const [sites, setSites] = useState<SiteNaLista[] | null>(null);
  const [soDoAparelho, setSoDoAparelho] = useState(false);
  const [busca, setBusca] = useState("");

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
      </View>

      {filtrados === null ? (
        <View style={estilos.lista}>
          <EsqueletoDaLista />
        </View>
      ) : (
        <FlatList
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
            <View style={estilos.site}>
              <Text style={estilos.nome} numberOfLines={2}>
                {item.nome}
              </Text>
            </View>
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
 * `max_rows` (1000) do PostgREST.
 */
async function lerSites(): Promise<{ sites: SiteNaLista[]; soDoAparelho: boolean }> {
  try {
    const { data, error } = await supabase
      .from("sites")
      .select("id, nome")
      .order("nome");

    if (error) throw error;

    return {
      sites: data ?? [],
      soDoAparelho: false,
    };
  } catch {
    const banco = await abrirFila();
    const linhas = await banco.getAllAsync<{ site_id: number; site_nome: string }>(
      "select distinct site_id, site_nome from catalogo_de_qr order by site_nome",
    );
    return {
      sites: linhas.map((l) => ({ id: l.site_id, nome: l.site_nome })),
      soDoAparelho: true,
    };
  }
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  topo: { padding: espaco.interno, paddingBottom: espaco.minimo, gap: espaco.entreItens },
  aviso: { marginTop: 0 },
  lista: { padding: espaco.interno, paddingTop: espaco.minimo, gap: espaco.minimo },
  vazia: { flexGrow: 1, justifyContent: "center", padding: espaco.confortavel },
  site: {
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.cartao,
    padding: espaco.interno,
  },
  nome: texto(tipografia.apoioMedio, { cor: cores.texto }),
});
