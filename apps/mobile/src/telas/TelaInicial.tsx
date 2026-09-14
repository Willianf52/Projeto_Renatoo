import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CARGO_INSPETOR } from "@projeto-renatoo/shared";

import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useSessao } from "../auth/SessaoProvider";
import type { RotasDoApp } from "../navegacao/Navegacao";
import { Aviso } from "../componentes/Aviso";
import { Marca } from "../componentes/Marca";
import {
  IconeDeChecklist,
  IconeDeRelogio,
  IconeDeSincronizar,
} from "../componentes/icones";
import { contarPendentes, ultimaSincronizacao } from "../campo/fila";
import { sincronizar } from "../campo/sincronizacao";
import { supabase } from "../lib/supabase";
import { cores, espaco, raio, texto, tipografia } from "../tema";
import app from "../../app.json";

/**
 * Tela inicial: o menu de acoes que abre depois do login.
 *
 * O DESENHO E O DO SISTEMA QUE ESTE APP SUBSTITUI, de proposito. Os quinze
 * inspetores conhecem de cor a tela do PerformanceLab -- pergunta em cima,
 * tres cartoes ("Inspecao", "Agendados", "Sincronizar"), assinatura embaixo --
 * e trocar a disposicao junto com o aplicativo seria cobrar duas mudancas de
 * uma vez de quem so quer terminar a ronda. O que muda e a pele: navy e verde
 * da Up Servicos, e nao o azul e branco do sistema antigo, para o app nao
 * parecer dois produtos entre a tela de login e esta.
 *
 * O que o original mostra e este ainda nao: "OTA <hash>" e "Atualizacao
 * <data>" no rodape. Nao ha atualizacao por OTA neste app (nao usamos EAS
 * Update), e inventar um hash so para o rodape ficar igual seria decorar a
 * tela com um dado que nao existe.
 */

type Navegador = NativeStackNavigationProp<RotasDoApp>;

export function TelaInicial() {
  const { perfil, sessao, sair } = useSessao();
  const bordas = useSafeAreaInsets();
  const navegacao = useNavigation<Navegador>();

  const [aInspecionar, setAInspecionar] = useState<number | null>(null);
  const [pendentes, setPendentes] = useState(0);
  const [sincronizadoEm, setSincronizadoEm] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [aviso, setAviso] = useState<{ mensagem: string; tom: "erro" | "sucesso" } | null>(null);

  const idDoUsuario = sessao?.user.id ?? null;
  const soAsMinhas = perfil?.cargo === CARGO_INSPETOR;

  const atualizarRodape = useCallback(async () => {
    if (!idDoUsuario) return;
    const rodape = await lerRodapeDaFila(idDoUsuario);
    setPendentes(rodape.pendentes);
    setSincronizadoEm(rodape.sincronizadoEm);
  }, [idDoUsuario]);

  useEffect(() => {
    if (!idDoUsuario) return;

    // Mesma guarda de `TelaDeInspecoes`: resposta que chega depois do logout
    // nao pode pintar o contador do inspetor anterior.
    let ativo = true;

    lerRodapeDaFila(idDoUsuario)
      .then((rodape) => {
        if (!ativo) return;
        setPendentes(rodape.pendentes);
        setSincronizadoEm(rodape.sincronizadoEm);
      })
      .catch(() => {
        // Fila ilegivel (arquivo corrompido, por exemplo) nao pode derrubar o
        // menu: o rodape fica sem o carimbo e os cartoes continuam servindo.
        if (ativo) setSincronizadoEm(null);
      });

    contarAInspecionar(idDoUsuario, soAsMinhas)
      .then((quantas) => {
        if (ativo) setAInspecionar(quantas);
      })
      .catch(() => {
        // Sem numero e melhor que numero errado: o cartao aparece sem o
        // distintivo, e nao com um "0" que faria o inspetor achar que nao ha
        // visita nenhuma esperando por ele.
        if (ativo) setAInspecionar(null);
      });

    return () => {
      ativo = false;
    };
  }, [idDoUsuario, soAsMinhas]);

  const sincronizarAgora = useCallback(async () => {
    if (sincronizando || !idDoUsuario) return;

    setSincronizando(true);
    setAviso(null);

    try {
      // O id da SESSAO, nunca o gravado na linha da fila: e o mesmo token que
      // assina o insert, e a policy da 0036 exige que os dois batam.
      const resultado = await sincronizar(idDoUsuario);
      const enviadas = resultado.visitasCriadas + resultado.leiturasCriadas;

      if (resultado.falhas.length > 0) {
        setAviso({ mensagem: `Não foi possível enviar tudo: ${resultado.falhas[0].erro}`, tom: "erro" });
      } else if (enviadas === 0) {
        setAviso({ mensagem: "Nada pendente para enviar.", tom: "sucesso" });
      } else {
        setAviso({
          mensagem: `Enviadas ${resultado.visitasCriadas} visita(s) e ${resultado.leiturasCriadas} leitura(s).`,
          tom: "sucesso",
        });
      }
    } catch {
      // A fila fica intacta: nada aqui apaga o que nao subiu. E a mesma
      // promessa do marco 03 -- falhar sem perder.
      setAviso({ mensagem: "Não foi possível sincronizar agora.", tom: "erro" });
    } finally {
      setSincronizando(false);
      await atualizarRodape();
    }
  }, [sincronizando, idDoUsuario, atualizarRodape]);

  /**
   * `sair()` pode rejeitar -- `signOut` fala com a rede, e a limpeza da sessao
   * passa pelo SecureStore. Antes o botao chamava `sair` direto e a rejeicao
   * virava unhandled rejection: o inspetor tocava em "Sair", nada acontecia, e
   * nao havia nada na tela dizendo por que.
   */
  const sairAgora = useCallback(async () => {
    try {
      await sair();
    } catch {
      setAviso({ mensagem: "Não foi possível sair agora. Verifique a conexão.", tom: "erro" });
    }
  }, [sair]);

  /**
   * Sair com ronda pendente pede confirmacao.
   *
   * Nao e travar por travar: sair NAO apaga a fila, e a ronda continua no
   * aparelho esperando o mesmo inspetor voltar. O problema e que ela para de
   * ser drenavel enquanto outra pessoa estiver na sessao -- o recorte por
   * `funcionario_id` em `visitasPendentes` e justamente o que impede a sessao
   * seguinte de tentar envia-la e recebe-la de volta pelo RLS.
   *
   * Ou seja: sair aqui nao perde dado, atrasa dado. Quem esta em campo no fim
   * do dia precisa saber disso ANTES de passar o aparelho adiante, e nao
   * depois -- e o momento em que ainda da para pegar sinal e sincronizar.
   *
   * `Alert` e nao um estado de tela: e uma decisao de tres saidas, tomada uma
   * vez, e um modal do sistema e o que o inspetor ja reconhece.
   */
  const sairComGuarda = useCallback(async () => {
    let pendentesAgora = 0;
    try {
      pendentesAgora = idDoUsuario ? (await lerRodapeDaFila(idDoUsuario)).pendentes : 0;
    } catch {
      // Fila ilegivel nao pode prender o inspetor dentro do app: sem o numero,
      // sai direto. Travar a saida por causa da contagem seria pior que a
      // contagem faltar.
      pendentesAgora = 0;
    }

    if (pendentesAgora === 0) {
      await sairAgora();
      return;
    }

    Alert.alert(
      "Há ronda não sincronizada",
      `${pendentesAgora} registro(s) ainda não chegaram ao servidor. Eles ficam guardados neste aparelho e só voltam a subir quando você entrar de novo.`,
      [
        { text: "Sincronizar agora", onPress: () => void sincronizarAgora() },
        { text: "Sair mesmo assim", style: "destructive", onPress: () => void sairAgora() },
        { text: "Cancelar", style: "cancel" },
      ],
    );
  }, [idDoUsuario, sairAgora, sincronizarAgora]);

  const nome = perfil?.nome_completo?.trim() || perfil?.email || "Sem nome";

  return (
    <View style={estilos.raiz}>
      <View style={[estilos.cabecalho, { paddingTop: bordas.top + espaco.entreItens }]}>
        <View style={estilos.barra}>
          <Marca altura={28} />
          <Pressable
            onPress={() => void sairComGuarda()}
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [estilos.sair, pressed && estilos.sairPressionado]}
          >
            <Text style={estilos.sairTexto}>Sair</Text>
          </Pressable>
        </View>

        <Text style={estilos.pergunta}>O que você deseja fazer?</Text>
        <Text style={estilos.nome} numberOfLines={1}>
          {nome}
        </Text>
      </View>

      <ScrollView contentContainerStyle={estilos.conteudo}>
        <View style={estilos.grade}>
          <CartaoDeAcao
            titulo="Inspeção"
            descricao="Realizar inspeção e checklist"
            icone={<IconeDeChecklist cor={cores.primaria} />}
            distintivo={aInspecionar}
            aoTocar={() => navegacao.navigate("Inspecoes")}
          />
          <CartaoDeAcao
            titulo="Agendados"
            descricao="Visualizar checklists agendados"
            icone={<IconeDeRelogio cor={cores.primaria} />}
            aoTocar={() => navegacao.navigate("Agendados")}
          />
        </View>

        <View style={estilos.linhaCentral}>
          <CartaoDeAcao
            titulo="Sincronizar"
            descricao={sincronizando ? "Enviando..." : "Sincronização dos dados"}
            icone={<IconeDeSincronizar cor={cores.primaria} />}
            distintivo={pendentes > 0 ? pendentes : null}
            aoTocar={() => {
              void sincronizarAgora();
            }}
          />
        </View>

        {aviso ? <Aviso mensagem={aviso.mensagem} tom={aviso.tom} estilo={estilos.aviso} /> : null}

        <View style={estilos.rodape}>
          <Text style={estilos.rodapeLinha}>{nome}</Text>
          <Text style={estilos.rodapeDestaque}>{perfil?.cargo}</Text>
          <Text style={estilos.rodapeLinha}>
            Sincronizado: {sincronizadoEm ? formatarData(sincronizadoEm) : "nunca neste aparelho"}
          </Text>
          <Text style={estilos.rodapeLinha}>Versão: {app.expo.version}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Cartao tocavel do menu.
 *
 * Nao reusa `Cartao`: aquele e uma superficie passiva (moldura de tabela e de
 * formulario), e um `Pressable` em volta dele daria area de toque sem
 * nenhuma resposta visual ao dedo. Aqui o estado pressionado e parte do
 * componente -- em campo, com luva ou sol na tela, "eu toquei?" precisa ter
 * resposta.
 */
function CartaoDeAcao({
  titulo,
  descricao,
  icone,
  distintivo,
  aoTocar,
}: {
  titulo: string;
  descricao: string;
  icone: React.ReactNode;
  distintivo?: number | null;
  aoTocar: () => void;
}) {
  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. ${descricao}`}
      style={({ pressed }) => [estilos.cartao, pressed && estilos.cartaoPressionado]}
    >
      <View style={estilos.cartaoTopo}>
        {icone}
        {typeof distintivo === "number" && distintivo > 0 ? (
          <View style={estilos.distintivo}>
            <Text style={estilos.distintivoTexto}>{distintivo}</Text>
          </View>
        ) : null}
      </View>
      <Text style={estilos.cartaoTitulo}>{titulo}</Text>
      <Text style={estilos.cartaoDescricao}>{descricao}</Text>
    </Pressable>
  );
}

/**
 * Quantas visitas ainda esperam checklist -- o numero do distintivo.
 *
 * `checklists_visita(id)` e um embed do PostgREST, nao um join manual: a
 * visita sem checklist volta com a lista vazia, e e isso que se conta. A
 * alternativa (duas consultas e uma subtracao) daria o mesmo numero so
 * enquanto ninguem gravasse um checklist entre as duas.
 *
 * Fora do componente e sem `setState`, como `lerVisitas` -- ver a nota em
 * `SessaoProvider`.
 */
async function contarAInspecionar(idDoUsuario: string, soAsMinhas: boolean): Promise<number> {
  const consulta = supabase.from("visitas").select("id, checklists_visita ( id )");
  const comEscopo = soAsMinhas ? consulta.eq("funcionario_id", idDoUsuario) : consulta;

  const { data, error } = await comEscopo.limit(100);

  if (error || !data) throw new Error(error?.message ?? "sem dados");

  /**
   * O embed volta um OBJETO, nao uma lista: `checklists_visita` tem unique em
   * `visita_id` desde a 0042 ("uma visita nao recebe dois checklists"), entao
   * o PostgREST trata a relacao como um-para-um. O ramo do array continua aqui
   * porque o gerador de tipos admite os dois -- e se a unique cair um dia, o
   * contador nao passa a mentir em silencio.
   */
  return data.filter(({ checklists_visita: checklist }) => {
    if (checklist === null || checklist === undefined) return true;
    return Array.isArray(checklist) && checklist.length === 0;
  }).length;
}

/**
 * O rodape le a fila local, nao o servidor: "sincronizado" e um fato do
 * APARELHO. Fora do componente e sem `setState`, como `lerVisitas` em
 * `TelaDeInspecoes` -- devolve o que leu e deixa a tela decidir o que pintar.
 */
async function lerRodapeDaFila(
  funcionarioId: string,
): Promise<{ pendentes: number; sincronizadoEm: string | null }> {
  // `contarPendentes` recortado pelo inspetor da sessao; `ultimaSincronizacao`
  // nao, e de proposito: o carimbo responde "quando este APARELHO falou com o
  // servidor pela ultima vez", que e um fato do aparelho e nao de uma conta.
  const [fila, ultima] = await Promise.all([
    contarPendentes(funcionarioId),
    ultimaSincronizacao(),
  ]);
  return { pendentes: fila.visitas + fila.leituras, sincronizadoEm: ultima };
}

/** Mesma formatacao de `TelaDeInspecoes`: UTC do banco lido no fuso do aparelho. */
function formatarData(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "—";

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
    backgroundColor: cores.superficie,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
    paddingHorizontal: espaco.interno,
    paddingBottom: espaco.interno,
    gap: espaco.minimo,
  },
  barra: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sair: { paddingVertical: espaco.rotulo, paddingHorizontal: espaco.minimo, borderRadius: raio.medio },
  sairPressionado: { opacity: 0.6 },
  sairTexto: texto(tipografia.botaoDenso, { cor: cores.primaria }),
  pergunta: { ...texto(tipografia.apoio, { cor: cores.textoFraco }), marginTop: espaco.minimo },
  nome: texto(tipografia.subtitulo, { cor: cores.texto }),

  conteudo: { padding: espaco.interno, gap: espaco.entreItens },
  grade: { flexDirection: "row", gap: espaco.entreItens },
  // O terceiro cartao sozinho na linha, centralizado e com a largura de um dos
  // de cima -- e a forma do original, e ela nao e enfeite: "Sincronizar" e a
  // acao que fecha o dia, e separa-la das duas de comecar ronda evita o toque
  // errado com o aparelho na mao.
  linhaCentral: { flexDirection: "row", justifyContent: "center" },

  cartao: {
    flex: 1,
    maxWidth: "50%",
    backgroundColor: cores.superficie,
    borderRadius: raio.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: espaco.interno,
    gap: espaco.rotulo,
    minHeight: 132,
  },
  cartaoPressionado: { borderColor: cores.primaria, opacity: 0.9 },
  cartaoTopo: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  cartaoTitulo: { ...texto(tipografia.destaque, { cor: cores.texto }), marginTop: espaco.rotulo },
  cartaoDescricao: texto(tipografia.apoio, { cor: cores.textoFraco }),

  distintivo: {
    minWidth: 24,
    height: 24,
    borderRadius: raio.pilula,
    paddingHorizontal: 6,
    backgroundColor: cores.primaria,
    alignItems: "center",
    justifyContent: "center",
  },
  distintivoTexto: texto(tipografia.botaoDenso, { cor: cores.textoSobrePrimaria }),

  aviso: { marginTop: espaco.minimo },

  rodape: { alignItems: "center", gap: espaco.rotulo, marginTop: espaco.secao },
  rodapeLinha: texto(tipografia.nota, { cor: cores.textoFraco }),
  rodapeDestaque: texto(tipografia.rotulo, { cor: cores.primaria, caixaAlta: true }),
});
