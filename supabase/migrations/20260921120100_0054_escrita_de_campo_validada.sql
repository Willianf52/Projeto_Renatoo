-- ============================================================================
-- 0054 — escrita de campo do INSPETOR: carimbo do servidor e QR do site certo
--
-- O PROBLEMA (achado M3 da auditoria de AppSec de 16/09/2026).
--
-- A 0036 abriu INSERT em `visitas`/`leituras` para o INSPETOR com uma policy
-- que confere so duas coisas: o cargo e que a visita e dele. A 0038 deu o
-- grant de INSERT na TABELA inteira. Com o proprio token -- tirado de um
-- aparelho com root ou de um proxy HTTP --, um inspetor conseguia:
--
--   - escrever `criado_em` e `data_integracao`, apagando o sinal de que a
--     ronda foi enviada dias depois de "feita";
--   - pendurar numa visita do site A uma leitura com o QR-code do site B;
--   - registrar leitura com `data_hora` retroativa de meses, ou no futuro.
--
-- Para um sistema cujo produto e provar que a inspecao aconteceu, isso e a
-- integridade da prova, nao um detalhe de validacao.
--
-- A CORRECAO.
--   1. Grant por COLUNA, exatamente as que o app envia
--      (`linhaDeVisita`/`linhaDeLeitura` em packages/shared/src/campo/esquemas.ts).
--      `id`, `criado_em` e `data_integracao` ficam de fora: quem carimba e o
--      servidor. Coluna nova no app exige grant novo aqui -- de proposito.
--   2. Trigger em `leituras` para a sessao `authenticated`:
--        - QR-code, quando informado, precisa ser do site da visita;
--        - `data_hora` entre 30 dias atras e 1 hora a frente.
--      Reenvio de leitura que JA existe (a fila offline reenvia) passa sem
--      checagem, para o `on conflict do nothing` do app responder como sempre
--      -- sem isso, uma leitura legitima gravada ha 31 dias travaria a fila no
--      reenvio.
--
-- JANELA DE TEMPO. 30 dias para tras cobre aparelho que passou semanas sem
-- sinal; 1 hora para a frente tolera relogio de celular adiantado sem aceitar
-- leitura "de amanha". Leitura recusada fica na fila do aparelho com o erro
-- (`ultimo_erro`), visivel, e nao some.
--
-- O QUE CONTINUA ABERTO, E NAO SE FECHA COM CONSTRAINT: provar PRESENCA. O
-- INSPETOR le todos os QR-codes (achado L1 -- escopo por site ainda nao
-- existe) e `tem_localizacao` e declarado pelo aparelho. Fechar isso exige
-- coordenada gravada e raio do site conferido no servidor, e o vinculo
-- inspetor-grupo -- decisao de produto, nao desta migration.
--
-- A importacao (`/api/importar/coletas`, service_role) nao passa pelo trigger:
-- ele decide pelo papel da sessao, e nao por `auth.uid()` -- os testes pgTAP
-- deixam `request.jwt.claims` definido depois do `reset role`, e o carimbo de
-- sessao sozinho faria fixture de postgres cair na validacao.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Grants por coluna.
-- ---------------------------------------------------------------------------
revoke insert on public.visitas from authenticated;
revoke insert on public.leituras from authenticated;

grant insert (numero_coleta, site_id, funcionario_id, motivo_visita_id, coletor_dados_id)
  on public.visitas to authenticated;

grant insert (visita_id, data_hora, area_id, qr_code_id, evento_id, acao_id, qualificador_id, observacao, tem_localizacao)
  on public.leituras to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Coerencia da leitura de campo.
-- ---------------------------------------------------------------------------
create schema if not exists manutencao;

create or replace function manutencao.validar_leitura_de_campo()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
begin
  -- So a escrita pela API com sessao de usuario. service_role (importacao),
  -- postgres (migrations, seed) e jobs seguem o proprio caminho.
  if coalesce(current_setting('role', true), '') <> 'authenticated' then
    return new;
  end if;

  -- Reenvio da fila offline: a linha ja existe (mesma chave de dedup da 0017,
  -- `nulls not distinct` em area_id). Deixa o INSERT seguir para colidir como
  -- sempre colidiu.
  if exists (
    select 1
      from public.leituras l
     where l.visita_id = new.visita_id
       and l.area_id is not distinct from new.area_id
       and l.data_hora = new.data_hora
  ) then
    return new;
  end if;

  if new.qr_code_id is not null and not exists (
    select 1
      from public.qr_codes q
      join public.visitas v on v.site_id = q.site_id
     where q.id = new.qr_code_id
       and v.id = new.visita_id
  ) then
    raise exception 'QR-code % nao pertence ao site da visita %', new.qr_code_id, new.visita_id
      using errcode = '42501';
  end if;

  if new.data_hora > now() + interval '1 hour'
     or new.data_hora < now() - interval '30 days' then
    raise exception 'data_hora fora da janela aceita para leitura de campo (30 dias para tras, 1 hora para a frente)'
      using errcode = '22008';
  end if;

  return new;
end;
$$;

revoke all on function manutencao.validar_leitura_de_campo() from public, anon, authenticated;

comment on function manutencao.validar_leitura_de_campo() is
  'Valida leitura gravada pela sessao authenticated: QR-code do site da visita e data_hora numa janela plausivel. Reenvio de leitura existente passa. Ver migration 0054.';

drop trigger if exists validar_leitura_de_campo on public.leituras;
create trigger validar_leitura_de_campo
  before insert on public.leituras
  for each row
  execute function manutencao.validar_leitura_de_campo();
