// Confere, antes de um deploy, que as variaveis de ambiente obrigatorias do
// ambiente-alvo estao presentes. lib/env.ts so valida as duas publicas do
// Supabase (proposital: builds sem importacao/webhook configurados continuam
// subindo, ver .env.example) -- este script existe para o deploy nao subir
// "quieto" com uma rota inteira quebrada (importacao ou webhook 500/401)
// porque faltou copiar um segredo para o ambiente de producao.
//
// Uso: node scripts/check-env.mjs
// Sentry (SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN) fica fora de proposito: e
// documentado como opcional, o app funciona sem.

const OBRIGATORIAS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "RESEND_API_KEY",
  "SUPABASE_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "IMPORTACAO_SECRET",
  // Alerta operacional. As duas entraram depois da primeira versao desta lista
  // e ficaram de fora ate a auditoria de 25/08 -- exatamente o buraco que o
  // cabecalho acima diz existir para fechar. Sem CRON_SECRET, o cron diario de
  // `api/cron/verificar-importacoes` responde 500 em toda execucao; sem
  // ALERTA_OPERACAO_EMAIL, `enviarAlertaOperacional` lanca e a rota responde
  // 502. Nos dois casos o aviso de "importacao em silencio" -- o controle que
  // avisa que os lotes pararam de chegar -- simplesmente nao existe.
  "CRON_SECRET",
  "ALERTA_OPERACAO_EMAIL",
];

const faltando = OBRIGATORIAS.filter((nome) => !process.env[nome]);

if (faltando.length > 0) {
  console.error(
    "Variaveis de ambiente obrigatorias ausentes para deploy:\n" +
      faltando.map((nome) => `  - ${nome}`).join("\n") +
      "\n\nVeja .env.example para o que cada uma faz. Sem elas, a rota " +
      "correspondente (troca de senha / webhook / importacao de coletas / " +
      "alerta operacional) " +
      "sobe quebrada em produção sem avisar no build.",
  );
  process.exit(1);
}

console.log("OK: todas as variáveis de ambiente obrigatórias estão presentes.");
