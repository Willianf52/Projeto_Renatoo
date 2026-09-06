import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";

import { supabase } from "../lib/supabase";
import { contarNaFila, esvaziarFila, iniciarVisita, reabrirParaReenvio, registrarLeitura } from "./fila";
import { sincronizar } from "./sincronizacao";

/**
 * Roteiro do marco 03 do plano "Abrindo o Portao": provar o fluxo offline
 * ponta a ponta ANTES de existir tela.
 *
 * O plano e explicito -- *"um script de teste, nao uma tela"*. Por isso este
 * arquivo nao usa nenhum componente do app (`Cartao`, `Botao`, o tema): a
 * saida e uma lista crua de linhas de log, que existe so para quem esta
 * olhando o emulador acompanhar o que o `console.log` ja diz. Nada daqui vira
 * UI de produto; quando o marco fechar, este arquivo sai do caminho.
 *
 * O roteiro NAO entra no app normal: ele so e montado quando
 * `EXPO_PUBLIC_ROTEIRO_MARCO_03` vale "1" (ver `index.ts`). Sem a variavel, o
 * bundle e o de sempre.
 *
 * COMO O AVIAO ENTRA NA HISTORIA. O roteiro nao liga nem desliga a rede -- ele
 * *espera* a rede mudar e narra o que acontece, para o modo aviao ser
 * acionado de fora (no emulador, `adb shell cmd connectivity airplane-mode
 * enable`, ou o botao do proprio aparelho). Simular a queda por dentro, com
 * um mock de fetch, provaria o mock; o que precisa ser provado e o aparelho.
 */

const EMAIL = process.env.EXPO_PUBLIC_ROTEIRO_EMAIL;
const SENHA = process.env.EXPO_PUBLIC_ROTEIRO_SENHA;
const SITE_ID = process.env.EXPO_PUBLIC_ROTEIRO_SITE_ID;

export function roteiroLigado(): boolean {
  return process.env.EXPO_PUBLIC_ROTEIRO_MARCO_03 === "1";
}

/** Prefixo fixo para filtrar no logcat: `adb logcat | grep MARCO03`. */
function narrar(linha: string) {
  console.log(`[MARCO03] ${linha}`);
}

/** Uma ida ao banco que qualquer sessao autenticada pode fazer, so para saber se ha rede. */
async function temRede(): Promise<boolean> {
  const { error } = await supabase.from("sites").select("id").limit(1);
  return !error;
}

async function esperarRede(desejada: boolean, narrarLinha: (l: string) => void): Promise<boolean> {
  const limite = Date.now() + 3 * 60 * 1000;
  let ultimoAviso = 0;

  while (Date.now() < limite) {
    if ((await temRede()) === desejada) return true;

    if (Date.now() - ultimoAviso > 10_000) {
      narrarLinha(desejada ? "aguardando a rede VOLTAR..." : "aguardando o MODO AVIAO...");
      ultimoAviso = Date.now();
    }

    await new Promise((resolver) => setTimeout(resolver, 2000));
  }

  return false;
}

async function rodarRoteiro(anotar: (linha: string) => void) {
  const anotarEnarrar = (linha: string) => {
    narrar(linha);
    anotar(linha);
  };

  if (!EMAIL || !SENHA || !SITE_ID) {
    anotarEnarrar(
      "FALTA CONFIGURAR: EXPO_PUBLIC_ROTEIRO_EMAIL, _SENHA e _SITE_ID em apps/mobile/.env",
    );
    return;
  }

  // ---------------------------------------------------------------------
  // 1) Login com rede. O plano trata isto como requisito operacional: o
  // inspetor precisa do primeiro login com sinal antes de sair a campo.
  // ---------------------------------------------------------------------
  anotarEnarrar("1/6 entrando com a conta de inspetor...");
  const { data: sessao, error: erroDeLogin } = await supabase.auth.signInWithPassword({
    email: EMAIL.trim().toLowerCase(),
    password: SENHA,
  });

  if (erroDeLogin || !sessao.user) {
    anotarEnarrar(`FALHOU no login: ${erroDeLogin?.message ?? "sem usuario na resposta"}`);
    return;
  }

  anotarEnarrar(`1/6 ok -- sessao de ${sessao.user.id}`);

  await esvaziarFila();

  // ---------------------------------------------------------------------
  // 2) Espera o modo aviao ser ligado por fora.
  // ---------------------------------------------------------------------
  anotarEnarrar("2/6 LIGUE O MODO AVIAO agora");
  if (!(await esperarRede(false, anotarEnarrar))) {
    anotarEnarrar("FALHOU: a rede nao caiu dentro de 3 minutos");
    return;
  }
  anotarEnarrar("2/6 ok -- sem rede");

  // ---------------------------------------------------------------------
  // 3) A ronda inteira acontece offline.
  // ---------------------------------------------------------------------
  const capturadoEm = new Date().toISOString();
  const chave = await iniciarVisita({
    siteId: Number(SITE_ID),
    funcionarioId: sessao.user.id,
    capturadoEm,
  });
  anotarEnarrar(`3/6 visita criada offline, chave ${chave}`);

  const primeira = await registrarLeitura({ chaveDaVisita: chave, dataHora: capturadoEm });
  const segunda = await registrarLeitura({
    chaveDaVisita: chave,
    dataHora: new Date(Date.parse(capturadoEm) + 60_000).toISOString(),
  });
  // O mesmo QR tocado duas vezes por engano: o indice local recusa, e o
  // aparelho nunca chega a mandar para o servidor uma duplicata que ele
  // recusaria de qualquer jeito.
  const repetida = await registrarLeitura({ chaveDaVisita: chave, dataHora: capturadoEm });

  const naFila = await contarNaFila();
  anotarEnarrar(
    `3/6 leituras: 1a=${primeira} 2a=${segunda} repetida=${repetida} (esperado true/true/false); fila tem ${naFila.visitas} visita(s) e ${naFila.leituras} leitura(s)`,
  );

  // ---------------------------------------------------------------------
  // 4) Sincronizar sem rede tem que falhar SEM perder nada.
  // ---------------------------------------------------------------------
  const semRede = await sincronizar();
  anotarEnarrar(
    `4/6 sync offline: criou ${semRede.visitasCriadas} visita(s), ${semRede.leiturasCriadas} leitura(s), falhas=${semRede.falhas.length} (esperado 0/0/1)`,
  );
  if (semRede.falhas[0]) anotarEnarrar(`4/6 erro registrado: ${semRede.falhas[0].erro}`);

  // ---------------------------------------------------------------------
  // 5) Rede de volta: a fila sobe.
  // ---------------------------------------------------------------------
  anotarEnarrar("5/6 DESLIGUE O MODO AVIAO agora");
  if (!(await esperarRede(true, anotarEnarrar))) {
    anotarEnarrar("FALHOU: a rede nao voltou dentro de 3 minutos");
    return;
  }

  const comRede = await sincronizar();
  anotarEnarrar(
    `5/6 sync: criou ${comRede.visitasCriadas} visita(s) e ${comRede.leiturasCriadas} leitura(s); ja existiam ${comRede.visitasJaExistiam}/${comRede.leiturasJaExistiam}; falhas=${comRede.falhas.length}`,
  );
  if (comRede.falhas[0]) anotarEnarrar(`5/6 erro: ${comRede.falhas[0].erro}`);

  // ---------------------------------------------------------------------
  // 6) O reenvio -- o coracao do marco. Imita a resposta perdida no caminho:
  // o servidor gravou, o aparelho nao soube, e a proxima sincronizacao manda
  // tudo de novo.
  // ---------------------------------------------------------------------
  await reabrirParaReenvio();
  const reenvio = await sincronizar();
  anotarEnarrar(
    `6/6 REENVIO: criou ${reenvio.visitasCriadas} visita(s) e ${reenvio.leiturasCriadas} leitura(s); ja existiam ${reenvio.visitasJaExistiam}/${reenvio.leiturasJaExistiam}; falhas=${reenvio.falhas.length}`,
  );

  const duplicou = reenvio.visitasCriadas > 0 || reenvio.leiturasCriadas > 0;
  anotarEnarrar(duplicou ? "VEREDITO: DUPLICOU -- marco 03 falhou" : "VEREDITO: nao duplicou");
  anotarEnarrar(`chave da visita deste teste: ${chave}`);
}

export function RaizDoRoteiro() {
  const [linhas, setLinhas] = useState<string[]>([]);

  useEffect(() => {
    let vivo = true;
    const anotar = (linha: string) =>
      setLinhas((anteriores) => (vivo ? [...anteriores, linha] : anteriores));

    rodarRoteiro(anotar).catch((falha: unknown) => {
      const motivo = falha instanceof Error ? falha.message : String(falha);
      narrar(`EXCECAO: ${motivo}`);
      anotar(`EXCECAO: ${motivo}`);
    });

    return () => {
      vivo = false;
    };
  }, []);

  return (
    <ScrollView style={estilos.fundo} contentContainerStyle={estilos.conteudo}>
      {linhas.map((linha, indice) => (
        <Text key={indice} style={estilos.linha}>
          {linha}
        </Text>
      ))}
    </ScrollView>
  );
}

// Sem o tema do app de proposito -- ver o cabecalho. Isto e um terminal, nao
// uma tela do produto.
const estilos = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: "#000" },
  conteudo: { padding: 12, paddingTop: 48 },
  linha: { color: "#0f0", fontSize: 11, fontFamily: "monospace", marginBottom: 6 },
});
