# Backup e restauração do banco

P1-1 e P1-2 da auditoria de 11/09/2026. Decisões tomadas pelo dono do produto
em 13/09/2026. Este documento é a metade operacional que faltava em
`docs/lgpd-privacidade.md`: quanto se perde, em quanto tempo volta e quem
executa.

## A situação real, sem arredondar

**Não existe backup restaurável do banco de produção hoje.**

- A organização do Supabase está no plano **Free**. No Free, backup diário não
  é acessível pelo painel nem pela API — a documentação do Supabase manda
  projetos Free fazerem o próprio dump.
- A alternativa de guardar um dump criptografado como artifact do GitHub foi
  **recusada**: o repositório é **público**, e artifact de repositório público
  pode ser baixado por qualquer conta do GitHub. O dump contém dado pessoal.
- O que existe é um **ensaio**: a CI tira um dump de produção, restaura num
  banco descartável, confere e apaga. Ele prova que a restauração funciona e
  mede o tempo — não guarda nada.

| Medida | Valor hoje | Por quê |
|---|---|---|
| **RPO** (quanto se perde) | **Tudo desde a criação do projeto**, no pior caso | Não há cópia guardada fora do próprio Supabase. |
| **RTO** (em quanto tempo volta) | Medido a cada ensaio — ver o resumo do último run de *Ensaio de restauração* | Tempo de restaurar o dump num Postgres novo. Não inclui criar projeto nem reapontar a aplicação (~30 min a mais). |
| **Quem executa** | Dono do projeto na organização `project_renato` do Supabase | Único com acesso ao painel e à senha do banco. |

### Saída de emergência (paga, e só em último caso)

A própria documentação do Supabase informa que, hoje, projetos Free têm até 7
backups diários guardados internamente, que ficam **acessíveis ao fazer
upgrade para Pro** (US$ 25/mês) — e avisa que isso pode deixar de valer.

**Decisão de 14/09/2026: o projeto não assina o Pro.** Esta saída fica
registrada só como o que existe tecnicamente numa perda de dado grave — seria
uma decisão de gasto a tomar na hora, não parte do plano.

### Para ter backup de verdade, sem custo (decisão em aberto)

Com o Pro descartado, sobram as duas opções gratuitas:

1. **Repositório privado** — repositório privado no GitHub não custa nada, e
   aí o dump criptografado como artifact de 30 dias volta a ser aceitável (o
   workflow muda pouco). Custo real: o repositório deixa de ser público, e os
   minutos de Actions passam a contar na cota gratuita de repositório privado.
2. **Bucket privado próprio** (ex.: Cloudflare R2, cota gratuita de 10 GB) — o
   dump criptografado vai para lá, nunca vira artifact, e o repositório segue
   público. Exige criar a conta e mais dois secrets.

Qualquer uma das duas depende do secret `PRODUCAO_DB_URL` (seção abaixo).

## O ensaio (`.github/workflows/ensaio-de-restauracao.yml`)

Roda **no dia 1 de cada mês**, sob demanda (*Actions → Ensaio de restauração →
Run workflow*) e em **todo PR que altera `supabase/migrations/`**.

1. Conta as linhas de cada tabela de `public` e de `auth.users` em produção.
2. `supabase db dump` em três arquivos (roles, schema, dados), como a
   documentação do Supabase manda.
3. Conta de novo (produção segue recebendo escrita durante o dump).
4. Sobe um Supabase **vazio** dentro do runner e restaura, **cronometrado**.
5. Confere: cada tabela da cópia precisa ficar entre a contagem de antes e a de
   depois. Tabela ausente reprova.
6. **Só em PR:** aplica, por cima da cópia, as migrations do PR que ainda não
   estão no histórico de produção. É o P1-1 — a migration roda contra dado real
   antes de rodar contra a operação.

O dump **nunca** sai do runner, e o log não mostra dado: o repositório é
público. Erros do `psql` saem só com o código (`VERBOSITY=sqlstate`), porque a
mensagem padrão carrega valor de linha.

### O que o ensaio não cobre

- **Objetos do Storage** (fotos e assinaturas de checklist): o dump do banco só
  leva a linha que aponta para o arquivo, não o arquivo.
- **Triggers e policies em `auth` e `storage`**: o dump de schema do Supabase
  exclui esses schemas. Numa restauração real, o trigger `on_auth_user_created`
  (migration 0001) e as policies do bucket `checklists` (0042/0045) precisam ser
  reaplicados a partir das migrations.
- **Configuração da plataforma**: chaves de API, URL do projeto, SMTP, provedores
  de login. Um projeto novo tem chaves novas, e as env vars da Vercel e do app
  mobile precisam ser trocadas.

## Configuração que falta (uma vez)

Sem este secret, o workflow roda e **se pula sozinho**, com um aviso.

1. No painel do Supabase: *Connect* → **Session pooler** → copiar a connection
   string. **Não** a conexão direta: o runner do GitHub não tem IPv6, e o host
   direto do Supabase só responde em IPv6.
2. Trocar `[YOUR-PASSWORD]` pela senha do banco (*Project Settings → Database*;
   se ninguém souber, resetar ali — a aplicação não usa essa senha, usa as
   chaves de API).
3. No GitHub: *Settings → Secrets and variables → Actions → New repository
   secret*, nome **`PRODUCAO_DB_URL`**.
4. Rodar o workflow uma vez pela aba *Actions* e conferir o resumo.

O secret dá acesso de leitura **e escrita** ao banco inteiro. Em repositório
público ele continua protegido (secret não aparece em log nem vai para PR de
fork), mas quem tem permissão de escrita no repositório consegue usá-lo num
workflow. Hoje isso é só o dono do projeto.

## P1-1: por que não há projeto de staging

Um segundo projeto Free custaria US$ 0, mas ocupa a última vaga de projeto
ativo da organização e pausa sozinho após 7 dias sem uso. A decisão foi **não
criar agora**. O objetivo do item — testar migration contra dado real antes de
produção — ficou coberto pelo passo 6 do ensaio, sem projeto novo e sem copiar
dado pessoal para fora do runner.

Continua sem existir um ambiente de staging **para a aplicação** (uma URL onde
testar o painel contra dado de verdade). Se isso for necessário, a decisão de
criar o projeto volta à mesa.
