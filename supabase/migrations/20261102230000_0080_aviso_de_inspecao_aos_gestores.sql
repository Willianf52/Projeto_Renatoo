-- ============================================================================
-- 0080 -- Aviso de inspecao aos gestores (pedido do dono, 02/11/2026)
--
-- No sistema de referencia, a cada inspecao enviada chega um e-mail aos
-- gestores dizendo quem inspecionou qual lugar, com o PDF do checklist
-- anexado. Aqui o aviso existia so para o SUPERIOR de quem enviou, com a caixa
-- "Checklist" marcada (0068) -- e ninguem estava configurado assim.
--
-- O QUE MUDA: o checklist enviado passa a avisar tambem TODOS OS GESTORES
-- ATIVOS (decisao do dono). Mesma fila (`checklist_emails`), mesmo envio
-- (`lib/fila-de-emails-de-checklist.ts`), que agora anexa o PDF. O aviso ao
-- superior da 0068 continua igual.
--
-- A TRAVA (`manutencao.aviso_de_inspecao.somente_para`): o dono pediu que,
-- enquanto testa, so ele receba. Nula, todos os gestores recebem; uma lista,
-- so os gestores com esses e-mails (minusculos); vazia, nenhum. Nasce VAZIA de
-- proposito: aplicar esta migration nao manda e-mail a ninguem, e liberar --
-- para o dono ou para todos -- e um `update` consciente, feito a parte. A
-- trava vale so para o grupo novo: o aviso ao superior ja tinha a propria
-- chave (a caixa no cadastro) e nao muda de comportamento aqui.
--
-- Os e-mails vem de `profiles.email`. As contas importadas em 19/10 com o
-- LOGIN no lugar do e-mail recebem o aviso no endereco errado ate serem
-- corrigidas -- outra razao para a trava nascer fechada.
--
-- Transacional e sem `begin`/`commit` explicito, pela convencao da 0041.
-- ============================================================================

create table if not exists manutencao.aviso_de_inspecao (
  -- Uma linha so: a chave e sempre `true`.
  unica boolean primary key default true check (unica),
  somente_para text[]
);

comment on table manutencao.aviso_de_inspecao is
  'Quem recebe o aviso de inspecao aos gestores (0080). somente_para nula = todos os gestores ativos; lista = so esses e-mails; vazia = nenhum.';

insert into manutencao.aviso_de_inspecao (unica, somente_para)
values (true, '{}')
on conflict (unica) do nothing;

alter table manutencao.aviso_de_inspecao enable row level security;

drop policy if exists "Nenhum acesso pela API" on manutencao.aviso_de_inspecao;
create policy "Nenhum acesso pela API" on manutencao.aviso_de_inspecao
  for all to anon, authenticated
  using (false)
  with check (false);

revoke all on manutencao.aviso_de_inspecao from public, anon, authenticated;

-- O nome da funcao fica o da 0068: o trigger aponta para ela, e trocar o nome
-- seria trocar o trigger junto sem ganho nenhum.
create or replace function manutencao.email_do_checklist_ao_superior()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
begin
  begin
    insert into public.checklist_emails (checklist_id, destinatario)
    select distinct new.id, d.email
      from (
        -- O superior de quem enviou, com a caixa marcada (0068).
        select lower(btrim(superior.email)) as email
          from public.visitas v
          join public.profiles autor on autor.id = v.funcionario_id
          join public.profiles superior on superior.id = autor.superior_id
         where v.id = new.visita_id
           and autor.email_superior_checklist
           and superior.ativo
           and superior.id <> autor.id
        union
        -- Todos os gestores ativos (0080), pela trava.
        select lower(btrim(g.email))
          from public.profiles g
         cross join manutencao.aviso_de_inspecao c
         where g.ativo
           and g.cargo = 'GESTOR'
           and (c.somente_para is null or lower(btrim(g.email)) = any (c.somente_para))
      ) as d
     where coalesce(d.email, '') <> '';
  exception when others then
    -- Como na 0065: um problema aqui nunca recusa o envio do checklist.
    raise warning 'email_do_checklist_ao_superior: e-mails nao enfileirados (checklist %): %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function manutencao.email_do_checklist_ao_superior() from public, anon, authenticated;

comment on table public.checklist_emails is
  'Aviso de checklist enviado: ao superior de quem enviou (caixa "Checklist", 0068) e aos gestores ativos (0080, pela trava manutencao.aviso_de_inspecao). Fila de envio; so o service_role le e escreve.';
