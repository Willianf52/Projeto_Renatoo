// Liga o servidor do Expo para mostrar o app no Expo Go do iPhone, e ja deixa
// o app montado antes de alguem abrir.
//
// POR QUE EXISTE (28/10/2026): a apresentacao para a empresa (04/11) e pelo
// Expo Go do iPhone. Na primeira abertura, o computador leva uns 2 minutos para
// montar o app, e o Expo Go desiste antes ("The request timed out"). Este
// script pede o app ao proprio servidor assim que ele sobe, para o iPhone
// receber pronto, do cache.
//
// Uso (em apps/mobile, com o iPhone no MESMO Wi-Fi deste computador):
//   pnpm run apresentar
// Deixe a janela aberta durante toda a apresentacao: fechar desliga o app.

import { spawn } from "node:child_process";
import os from "node:os";

const PORTA = 8081;
// Generoso de proposito: num computador lento o Expo levou mais de 3 minutos
// so para ligar (teste de 28/10/2026).
const ESPERA_DO_SERVIDOR_MS = 10 * 60_000;
const ESPERA_DA_MONTAGEM_MS = 6 * 60_000;

/** O endereco deste computador na rede local, que o iPhone usa para chegar aqui. */
function enderecoNaRede() {
  const candidatos = [];
  for (const [nome, enderecos] of Object.entries(os.networkInterfaces())) {
    for (const e of enderecos ?? []) {
      if (e.family !== "IPv4" || e.internal) continue;
      if (!/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(e.address)) continue;
      // Wi-Fi primeiro: e a rede em que o iPhone tambem esta.
      candidatos.push({ endereco: e.address, prioridade: /wi-?fi|wlan|wireless/i.test(nome) ? 0 : 1 });
    }
  }
  candidatos.sort((a, b) => a.prioridade - b.prioridade);
  return candidatos[0]?.endereco ?? null;
}

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

async function servidorNoAr(base) {
  const limite = Date.now() + ESPERA_DO_SERVIDOR_MS;
  while (Date.now() < limite) {
    try {
      const resposta = await fetch(`${base}/status`, { signal: AbortSignal.timeout(5_000) });
      if ((await resposta.text()).includes("running")) return true;
    } catch {
      // ainda subindo
    }
    await esperar(2_000);
  }
  return false;
}

/** Pede o app como o Expo Go do iPhone pediria, para ele ficar montado no cache. */
async function montarApp(base) {
  const manifesto = await fetch(base, {
    headers: { "expo-platform": "ios", accept: "application/expo+json,application/json" },
    signal: AbortSignal.timeout(60_000),
  }).then((r) => r.json());
  const url = manifesto?.launchAsset?.url;
  if (!url) throw new Error("o servidor nao devolveu o endereco do app");
  const resposta = await fetch(url, { signal: AbortSignal.timeout(ESPERA_DA_MONTAGEM_MS) });
  await resposta.arrayBuffer();
  if (!resposta.ok) throw new Error(`o servidor respondeu ${resposta.status} ao montar o app`);
}

const ip = enderecoNaRede();
if (!ip) {
  console.error("Nao achei o endereco deste computador na rede. Conecte ao Wi-Fi e tente de novo.");
  process.exit(1);
}
const base = `http://${ip}:${PORTA}`;

console.log(`\nLigando o app em ${base} ...\n`);
// Uma string so, com shell: e como o Windows acha o `npx` (que e `npx.cmd`), sem
// o aviso DEP0190 de passar argumentos soltos com `shell: true`. Nada aqui vem
// de fora: a porta e fixa.
const expo = spawn(`npx expo start --lan --port ${PORTA}`, {
  shell: true,
  stdio: "inherit",
  env: { ...process.env, CI: "1", REACT_NATIVE_PACKAGER_HOSTNAME: ip, EXPO_NO_TELEMETRY: "1" },
});
expo.on("exit", (codigo) => process.exit(codigo ?? 0));

/**
 * Encerra o Expo inteiro. No Windows, `kill` derruba so o shell intermediario e
 * o Expo continua ocupando a porta (visto no teste de 28/10/2026): `taskkill /T`
 * leva a arvore de processos junto.
 */
function desligarExpo() {
  if (process.platform === "win32" && expo.pid) {
    spawn("taskkill", ["/pid", String(expo.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    expo.kill();
  }
}

if (!(await servidorNoAr(base))) {
  console.error("\nO servidor do Expo nao subiu em 10 minutos. Feche esta janela e rode de novo.");
  desligarExpo();
  process.exit(1);
}

console.log("\nMontando o app (na primeira vez leva uns 2 minutos) ...");
const inicio = Date.now();
try {
  await montarApp(base);
  const segundos = Math.round((Date.now() - inicio) / 1000);
  console.log(`\n========================================================`);
  console.log(`  PRONTO (montado em ${segundos} s).`);
  console.log(`  No iPhone, no mesmo Wi-Fi, abra no Safari:`);
  console.log(`      exp://${ip}:${PORTA}`);
  console.log(`  Deixe esta janela aberta durante a apresentacao.`);
  console.log(`========================================================\n`);
} catch (falha) {
  console.error(`\nNao consegui montar o app antes (${falha.message}). O iPhone ainda abre, mas pode demorar na primeira vez.`);
}
