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
      "latitude": -30.0346,
      "longitude": -51.2177,
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

**`latitude`/`longitude` nulos têm significado.** Querem dizer "o aparelho não
obteve sinal", e são o que alimenta o filtro Com/Sem Localização. Não confunda
com zero.

**Ou entra tudo, ou não entra nada.** O lote inteiro é resolvido antes da
primeira escrita. Importar as linhas válidas e listar as inválidas deixaria o
arquivo metade dentro e metade fora, e quem reenvia o corrigido não teria como
saber o que já entrou.

**Reenviar o mesmo arquivo é seguro.** Visita repetida é atualizada
(`unique (numero_coleta, site_id)`); leitura repetida é ignorada
(`unique (visita_id, area_id, data_hora)`).

> Ressalva: no Postgres, índice único não considera dois `NULL` iguais — uma
> leitura **sem `area`** escapa dessa deduplicação e entra de novo a cada
> reenvio. Vale até a constraint da 0004 ganhar um `nulls not distinct`.

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
