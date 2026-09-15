# Piloto de operação — P2-5

O último item aberto da auditoria de 11/09, e o único que nenhum commit fecha.
O sistema está bem medido contra si mesmo; nunca foi medido contra a
realidade. Este documento é o roteiro para isso acontecer de um jeito em que,
se quebrar, alguém veja.

> **Decisões de 15/09/2026 (dono do produto):**
>
> - **Escopo: 1 site, 2 inspetores.** Dois inspetores no mesmo site permitem
>   separar "o sistema está errado" de "aquele aparelho está errado" — se um
>   registra e o outro não, o problema não é o sistema. Um site só mantém o
>   cadastro pequeno o bastante para corrigir errado sem retrabalho grande.
> - **Início: assim que o backup existir.** Não é data, é condição. Gente
>   dentro do sistema sem backup é a única combinação em que um erro vira
>   perda definitiva.

## Estado de produção em 15/09/2026

Medido, não estimado:

| Tabela | Linhas | Observação |
|---|---|---|
| `profiles` | 3 | um GESTOR, um INSPETOR, um OPERADOR |
| `grupos_sites` | 2 | `mmmmmm` e `[TESTE] Homologacao mobile` |
| `sites` | 1 | `[TESTE] Posto Central` |
| `visitas` | 2 | do ensaio do marco 03, no emulador |
| `qr_codes`, `leituras`, `checklists_visita`, `importacoes`, `eventos_de_uso` | **0** | nada |
| `perguntas_checklist` | 5 | todas prefixadas `[TESTE]` |

Ou seja: **não existe um único QR-code em produção**, e o checklist que um
inspetor responderia hoje é o de homologação.

## Portões antes de qualquer pessoa entrar

Nenhum destes é opinião — cada um já mordeu neste projeto ou está medido como
ausente.

1. **Backup existindo de verdade.** Os workflows *Backup do banco* e *Ensaio
   de restauração* se pulam sozinhos sem os secrets; o check `ensaio` passando
   em 2 segundos é ele se pulando, não ele funcionando. Ver
   `docs/backup-e-restauracao.md`, seção "Configuração que falta".
2. **Migration 0052 aplicada** (expurgo da telemetria). Pendência de aplicação,
   não de código.
3. **As 10 perguntas definitivas do checklist**, no lugar das 5 `[TESTE]`. É
   migration, com pgTAP — e atenção à constraint
   `perguntas_checklist_ordem_unica`, que é global: a migration precisa
   apagar/reordenar as de teste antes de inserir nas mesmas ordens.
4. **O app rodando em aparelho físico.** Hoje ele **nunca rodou** fora de
   emulador. O login real foi observado, a fila offline foi provada no marco
   03 — tudo em emulador x86, cujo Keystore é implementação de software. Em
   aparelho real ainda não foram vistos: o Keychain/Keystore de verdade, o
   refresh de token em segundo plano e a revalidação de perfil ao voltar do
   `AppState`. Com `eas.json` e `expo-updates` no lugar (P0-2), o caminho é um
   build `preview` instalado nos dois aparelhos do piloto.
5. **Sentry do app com DSN configurado.** O pacote está instalado (P0-1);
   inerte sem a variável de ambiente. Sem DSN, o piloto perde exatamente o que
   ele existe para capturar.

## Ordem de povoamento

A ordem importa: cada passo depende do anterior por chave estrangeira.

1. **Grupo de sites** — *Cadastros → Grupo de Sites*. O site real não deve
   nascer dentro de `[TESTE] Homologacao mobile`.
2. **Site / Planta** — *Cadastros → Site / Planta*, dentro do grupo novo.
   Coordenadas e raio importam: é o que o app usa para julgar se a leitura
   aconteceu no lugar.
3. **QR-codes** — *Cadastros → QR Code*, um por ponto de ronda, todos amarrados
   ao site. **É daqui que sai o escopo do inspetor**: não há tabela de vínculo
   inspetor↔site; quem define o que ele alcança é o QR que ele escaneia
   (`qr_codes.site_id`).
4. **As duas contas de inspetor** — *Cadastros → Usuários*, cargo `INSPETOR`.
   **Conta nova nasce inativa** (migration 0019): sem ativar, o app mostra
   "Conta inativa" e isso não é bug. Ativar as duas explicitamente.
5. **As 10 perguntas do checklist** — migration, conforme o portão 3.
6. **A integração de importação**, se ela for parte do piloto: a rota
   `/api/importar/coletas` já grava toda tentativa em `importacoes`, inclusive
   as três recusas. Ligar depois que a ronda manual estiver funcionando, para
   não misturar duas fontes de erro na mesma semana.

Só depois de tudo isso funcionando com dado real: apagar as linhas `[TESTE]`.
Antes do backup existir, não apague nada — a limpeza é a operação com maior
chance de tirar junto o que não devia.

## O que olhar na primeira semana

Uma vez por dia, e leva dois minutos. O que cada número responde está na
coluna da direita.

```sql
-- Chegou dado de campo hoje?
select
  (select count(*) from visitas where criado_em::date = current_date) visitas_hoje,
  (select count(*) from leituras where data_hora::date = current_date) leituras_hoje,
  (select count(*) from checklists_visita where criado_em::date = current_date) checklists_hoje;

-- Quem entrou no painel, e onde foi (telemetria da 0051)
select evento, detalhes->>'rota' rota, cargo, count(*), max(criado_em) ultimo
from eventos_de_uso
where criado_em > now() - interval '7 days'
group by 1, 2, 3
order by max(criado_em) desc;

-- A integração tentou, e como foi
select status, count(*), max(criado_em) ultima
from importacoes
where criado_em > now() - interval '7 days'
group by 1;
```

Fora do banco, três sinais:

- **Sentry** — erro do app e do painel. Silêncio aqui com atividade no banco é
  bom sinal; silêncio nos dois quer dizer que ninguém usou.
- **`/api/health`** — deve responder. É o que um monitor externo bate a cada 5
  minutos.
- **Resend** — o alerta de importação em silêncio dispara sozinho por cron
  diário. Se chegar, a integração parou.

### Os números que já temos para comparar

A suíte de carga (PR #80) mediu, contra o build de produção, com 15 inspetores
gravando, 5 integradores com lotes de 200 linhas e 20 abas do painel: **p95 de
639 ms no campo, 310 ms na importação, 3,9 s no painel**. Se o piloto — que é
muito menor — sentir lentidão, o problema não é volume, e vale procurar em
outro lugar.

## Como saber que o piloto terminou bem

Não é "ninguém reclamou". São quatro fatos verificáveis:

1. **Uma ronda inteira nasceu offline e chegou completa** — escaneada em modo
   avião, sincronizada depois, sem duplicar. É o marco 03 repetido, agora com
   inspetor de verdade e aparelho de verdade.
2. **Os seis relatórios respondem com dado real** e o número bate com o que o
   inspetor diz ter feito. Desde a 0049 eles agregam no banco, sem teto de
   truncamento.
3. **Nenhum inspetor precisou de suporte para entrar** — conta ativa, senha
   dentro da política, login funcionando no aparelho dele.
4. **O expurgo e o backup rodaram pelo menos uma vez cada**, e o resumo do
   ensaio de restauração tem um RTO medido em vez de estimado.

Fechados esses quatro, o piloto vira operação: entram os outros 13 inspetores
e os 19 administrativos, e a régua deste documento passa a ser a de um sistema
em uso — não mais a de um sistema medido contra si mesmo.
