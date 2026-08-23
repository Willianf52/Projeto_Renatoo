# Importação de coletas

`POST /api/importar/coletas`

Entrada dos lotes vindos do sistema de origem. É o único caminho de escrita em
`visitas` e `leituras`: as migrations 0003/0004 dão a essas tabelas policy
apenas de `SELECT`, e a escrita passa pela `service_role`, no servidor.

## Autenticação

Header `x-importacao-secret`, comparado em tempo constante com
`IMPORTACAO_SECRET`. Não é sessão de navegador — quem chama é um processo de
integração, não uma pessoa logada. Sem o header, ou com valor errado: `401`.

Exige duas variáveis no servidor (ver `.env.example`):

| Variável | Para quê |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | escrever ignorando o RLS |
| `IMPORTACAO_SECRET` | autenticar quem envia |

Faltando qualquer uma, a rota responde `500` e **o resto do app continua
funcionando** — a chave é lida sob demanda, não na carga do módulo.

## Corpo

`{ "coletas": [...] }` ou um array cru. Uma linha por **leitura** (não por
visita): é o mesmo formato achatado que a tela de Coletas Importadas exporta.

```json
{
  "coletas": [
    {
      "numero_coleta": 10432,
      "site": "Agência Centro",
      "data_hora": "2026-08-01T08:12:00-03:00",
      "area": "Início",
      "qr_code": "QR-AGC-001",
      "funcionario_email": "operador@exemplo.com",
      "motivo_visita": "Inspeção",
      "coletor_dados": "Dispositivo Móvel",
      "evento": null,
      "acao": null,
      "qualificador": "Conforme",
      "observacao": null,
      "data_integracao": "2026-08-01T19:00:00-03:00"
    }
  ]
}
```

Obrigatórios: `numero_coleta`, `site`, `data_hora`. Todo o resto é opcional.

Máximo de **1000 linhas** por requisição — lote maior vira mais de uma chamada.

### Regras que valem a pena saber antes de montar o arquivo

**`data_hora` precisa do fuso.** `"2026-08-01T08:12:00"` é recusado. Sem
deslocamento explícito, o mesmo arquivo importado de duas máquinas em fusos
diferentes geraria horários diferentes, sem erro nenhum. Aceita `-03:00`,
`-0300` ou `Z`.

**Referências são resolvidas por nome, e nome desconhecido recusa a linha.**
`site`, `area`, `motivo_visita`, `coletor_dados`, `evento`, `acao`,
`qualificador` e `qr_code` precisam já existir no cadastro; `funcionario_email`
precisa bater com um `profiles.email`. A alternativa — gravar `null` — deixaria
a coluna vazia na tela, indistinguível de um campo que o dispositivo
legitimamente não preencheu. Cadastre a referência primeiro, ou deixe o campo
fora do lote.

A comparação **ignora caixa, mas não acento**: `"início"` acha `"Início"`,
`"Inicio"` não. Normalizar acento faria `"Ação"` e `"Acao"` virarem o mesmo
registro, e aí dois cadastros legítimos colidiriam em silêncio.

**Nome ambíguo também recusa.** `sites.nome` não é `unique` (migration 0003):
duas unidades homônimas em grupos diferentes são cadastro legítimo, e escolher
uma pela ordem que o banco devolveu penduraria a visita no site errado.

**`latitude`/`longitude` viram apenas uma flag.** As colunas saíram do banco
na migration 0022; o valor não é mais guardado. Mas a **presença** do par
ainda importa: ela grava `leituras.tem_localizacao` (migration 0023), que é o
que alimenta o filtro Com/Sem Localização da tela — esse filtro sempre
perguntou se o aparelho obteve sinal, nunca exibiu a coordenada.

Continue enviando os dois campos quando houver sinal. O par tem que estar
completo: só latitude, ou só longitude, conta como sem localização. O valor
não é mais validado — uma latitude 91 não recusa o lote, porque nada é
gravado a partir dela.

**Ou entra tudo, ou não entra nada.** O lote inteiro é resolvido antes da
primeira escrita. Importar as linhas válidas e listar as inválidas deixaria o
arquivo metade dentro e metade fora, e quem reenvia o corrigido não teria como
saber o que já entrou.

**Reenviar o mesmo arquivo é seguro.** Visita repetida é atualizada
(`unique (numero_coleta, site_id)`); leitura repetida é ignorada
(`unique (visita_id, area_id, data_hora) nulls not distinct`, migration
0017 — sem o `nulls not distinct`, uma leitura sem `area` escaparia da
deduplicação e entraria de novo a cada reenvio, porque índice único comum não
considera dois `NULL` iguais).

## Respostas

| Status | Quando |
|---|---|
| `200` | importado — `{ visitas, leituras_recebidas, leituras_novas }` |
| `400` | corpo malformado, campo obrigatório ausente, formato de data/número inválido. Cita a linha |
| `401` | segredo ausente ou errado |
| `422` | lote válido em forma, mas com referências desconhecidas ou ambíguas. Traz até 20 problemas e o total |
| `500` | `IMPORTACAO_SECRET` ou `SUPABASE_SERVICE_ROLE_KEY` não configurados |
| `502` | falha ao consultar ou gravar no banco |

`leituras_novas` menor que `leituras_recebidas` não é erro: é a deduplicação
funcionando num reenvio.

## Rastro de cada tentativa

Toda chamada que passa do segredo e do limite de taxa grava uma linha em
`importacoes` (migration 0033) — sucesso ou qualquer uma das seis recusas
acima, com origem (IP), status, contagens e mensagem. `401`/`429` ficam de
fora: não são tentativa de lote, são a rota rejeitando quem não provou ser a
integração.

Sem tela própria de propósito (decisão do dono do produto, 2026-08-21) --
consulte direto no banco (`select * from importacoes order by criado_em desc`).
O registro é *best-effort*: se a gravação em `importacoes` falhar, vira
`erro()` no log/Sentry, mas nunca muda a resposta HTTP de quem importou -- a
tabela é auditoria, não parte do contrato da rota.

## Alertas

Dois avisos por e-mail (`lib/resend.ts`, `enviarAlertaOperacional`), os dois
best-effort -- falha ao enviar vira `erro()`, nunca muda a resposta de quem
chamou nem trava o cron:

- **Lote recusado.** Disparado dentro da própria rota, em qualquer uma das
  seis recusas. No máximo 1 e-mail a cada 15 minutos (`limitarTaxa`,
  `alerta-importacao-falha`) -- um problema real tende a se repetir a cada
  reenvio, e sem o limite cada tentativa viraria um e-mail novo. O registro em
  `importacoes` continua sem esse limite: o throttle é só no aviso.
- **Silêncio prolongado.** `GET /api/cron/verificar-importacoes`, alvo de um
  Vercel Cron Job (`vercel.json`, uma vez por dia -- mais frequente exige
  plano Pro). Confere a linha mais recente de `importacoes`; sem nenhuma nas
  últimas `IMPORTACAO_SILENCIO_HORAS` (padrão 24h, `lib/importacao-alerta.ts`)
  -- inclusive se a tabela nunca recebeu nada -- avisa. Protegida por
  `CRON_SECRET`: a Vercel manda `Authorization: Bearer <valor>` sozinha
  quando a variável está configurada no projeto.

**Sem domínio verificado no Resend, os dois só entregam se
`ALERTA_OPERACAO_EMAIL` for o mesmo e-mail do dono da conta Resend** -- ver o
comentário de `REMETENTE` em `lib/resend.ts`. Troque por um endereço de
equipe quando o domínio for verificado.

## Exemplo

```bash
curl -X POST http://localhost:3000/api/importar/coletas \
  -H "content-type: application/json" \
  -H "x-importacao-secret: $IMPORTACAO_SECRET" \
  -d @lote.json
```

Para um banco local recém-criado, `supabase/seed.sql` já deixa cadastrados os
sites e QR codes usados no exemplo acima (`Agência Centro`, `QR-AGC-001`),
além das tabelas de referência que a 0004 deixa vazias.
