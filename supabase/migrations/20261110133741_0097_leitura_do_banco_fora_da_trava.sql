-- ============================================================================
-- 0097: a trava de leitura de campo nao vale para a leitura que o banco grava
--
-- POR QUE EXISTE (10/11/2026): a 0096 passou a gravar o "Inicio" e o
-- "Termino" de todo checklist enviado. A trava `validar_leitura_de_campo`
-- (janela de 30 dias, QR do site) roda com o papel de quem envia, e o
-- checklist pode chegar com a data em que foi PREENCHIDO no aparelho: um
-- checklist feito ha mais de 30 dias e enviado agora, ou de uma visita aberta
-- ha mais de 30 dias, tinha o envio inteiro recusado por causa da leitura que
-- o proprio banco gravava. A CI pegou no `numero_ano_do_checklist_test.sql`.
--
-- A trava existe para conferir o que o CELULAR manda. Leitura gravada por outro
-- gatilho (`pg_trigger_depth() > 1`) e do banco: passa direto. O que o app
-- insere segue conferido como antes.
-- ============================================================================

create or replace function manutencao.validar_leitura_de_campo()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $function$
begin
  -- So a escrita pela API com sessao de usuario. service_role (importacao),
  -- postgres (migrations, seed) e jobs seguem o proprio caminho.
  if coalesce(current_setting('role', true), '') <> 'authenticated' then
    return new;
  end if;

  -- Leitura gravada pelo proprio banco (o Inicio e o Termino do envio do
  -- checklist, 0096), e nao pelo app: a trava nao se aplica (0097).
  if pg_trigger_depth() > 1 then
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
$function$;
