-- ============================================================================
-- 0081 -- "Enviar Evento" por e-mail, do detalhe da ocorrencia
--
-- O "Registro de Evento On-Line" do sistema de referencia tem um botao de
-- envelope: escolhe-se uma ou mais pessoas em "Destinatarios" e "Enviar
-- Evento" manda o evento por e-mail a elas. "E-mails Enviados" mostra depois
-- o destinatario, a data e o REMETENTE (quem mandou).
--
-- Aqui o envio reaproveita a fila da 0065: a funcao so enfileira, e o aviso do
-- banco ao portal (`avisar_portal_dos_emails_de_ocorrencia`) dispara a entrega
-- como nas outras mensagens da ocorrencia.
--
--   1) `ocorrencia_emails.motivo` passa a aceitar 'ENVIO' (o envio manual).
--   2) `ocorrencia_emails.enviado_por`: quem mandou. Nulo nas mensagens
--      automaticas (abertura, analise, finalizacao), que ninguem "mandou".
--   3) `enviar_ocorrencia_por_email(ocorrencia, pessoas)`: so quem ve toda a
--      operacao (a mesma regra de quem analisa, 0064). Envia para o e-mail de
--      cadastro de cada pessoa ATIVA escolhida, sem repetir endereco.
--
-- O trabalho e `security definer` (a sessao nao escreve na fila: 0065, so o
-- service_role) no schema `escrita`, fora do PostgREST, e `public` so tem o
-- envelope `security invoker` -- a regra da 0050, no molde da 0067. O portao
-- e a checagem de `pode_ver_toda_operacao()` dentro da funcao, que le o JWT
-- de quem chama.
-- ============================================================================

-- 1) Motivo 'ENVIO' -----------------------------------------------------------
alter table public.ocorrencia_emails drop constraint if exists ocorrencia_emails_motivo_check;
alter table public.ocorrencia_emails
  add constraint ocorrencia_emails_motivo_check
  check (motivo in ('ABERTURA', 'ANALISE', 'FINALIZACAO', 'ENVIO'));

-- 2) Remetente ----------------------------------------------------------------
alter table public.ocorrencia_emails
  add column if not exists enviado_por uuid references public.profiles (id) on delete set null;

comment on column public.ocorrencia_emails.enviado_por is
  'Quem mandou o evento pelo "Enviar Evento" (motivo ENVIO). Nulo nas mensagens automaticas. Ver migration 0081.';

-- 3) Enviar -------------------------------------------------------------------
create or replace function escrita.enviar_ocorrencia_por_email(
  p_ocorrencia_id bigint,
  p_destinatarios uuid[]
)
returns integer
language plpgsql
security definer
set search_path = escrita, public, pg_temp
as $$
declare
  v_quem uuid := auth.uid();
  v_quantos integer;
begin
  if v_quem is null or not public.pode_ver_toda_operacao() then
    raise exception 'Sem permissão para enviar este evento por e-mail.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.ocorrencias where id = p_ocorrencia_id) then
    raise exception 'Evento não encontrado.' using errcode = 'P0002';
  end if;

  if coalesce(cardinality(p_destinatarios), 0) = 0 then
    raise exception 'Escolha ao menos um destinatário.' using errcode = '22023';
  end if;

  -- Mesmo teto dos contatos do site (0065): ninguem dispara e-mail em massa
  -- por este botao.
  if cardinality(p_destinatarios) > 20 then
    raise exception 'Escolha no máximo 20 destinatários.' using errcode = '22023';
  end if;

  insert into public.ocorrencia_emails (ocorrencia_id, motivo, destinatario, enviado_por)
  select distinct p_ocorrencia_id, 'ENVIO', lower(btrim(p.email)), v_quem
    from public.profiles p
   where p.id = any (p_destinatarios)
     and p.ativo
     and p.email is not null
     and public.lista_de_emails_valida(array[lower(btrim(p.email))]);

  get diagnostics v_quantos = row_count;

  if v_quantos = 0 then
    raise exception 'Nenhum dos destinatários tem e-mail cadastrado.' using errcode = '22023';
  end if;

  return v_quantos;
end;
$$;

comment on function escrita.enviar_ocorrencia_por_email(bigint, uuid[]) is
  'Enfileira o evento para o e-mail de cadastro das pessoas escolhidas ("Enviar Evento" do detalhe). So quem ve toda a operacao. Devolve quantos e-mails entraram na fila. Ver migration 0081.';

revoke all on function escrita.enviar_ocorrencia_por_email(bigint, uuid[]) from public, anon;
grant execute on function escrita.enviar_ocorrencia_por_email(bigint, uuid[]) to authenticated;

-- O envelope que o painel chama por RPC: mesmo nome, roda como quem chama.
create or replace function public.enviar_ocorrencia_por_email(
  p_ocorrencia_id bigint,
  p_destinatarios uuid[]
)
returns integer
language sql
security invoker
set search_path = public, pg_temp
as $$
  select escrita.enviar_ocorrencia_por_email(p_ocorrencia_id, p_destinatarios);
$$;

comment on function public.enviar_ocorrencia_por_email(bigint, uuid[]) is
  '"Enviar Evento" do detalhe da ocorrencia. Envelope de escrita.enviar_ocorrencia_por_email -- migration 0081.';

revoke all on function public.enviar_ocorrencia_por_email(bigint, uuid[]) from public, anon;
grant execute on function public.enviar_ocorrencia_por_email(bigint, uuid[]) to authenticated;
