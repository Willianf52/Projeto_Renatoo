import type { Metadata } from "next";
import Link from "next/link";
import { LinkDoSuporte, PaginaLegal, SecaoLegal } from "@/components/legal/PaginaLegal";

/**
 * Politica de Cookies, publica (pedido do dono, 25/11/2026). Conferida no
 * codigo nesse dia: o portal so usa o cookie da sessao do Supabase
 * (`lib/supabase/cookie-options.ts`, 30 dias) e tres itens no navegador
 * (`lib/tema.ts`, `lib/email-lembrado.ts` e o bloqueio de tentativas do
 * `LoginForm`). Nada de analytics, publicidade nem gravacao de tela (o Sentry
 * esta com o Session Replay em 0).
 *
 * Por serem so necessarios, nao ha aviso de consentimento. SE ENTRAR ALGO NAO
 * ESSENCIAL (Google Analytics, por exemplo), esta pagina muda e o portal passa
 * a precisar do aviso com "aceitar" e "recusar" antes de carregar o script.
 */
const ATUALIZADA_EM = "25/11/2026";

export const metadata: Metadata = {
  title: "Política de Cookies - Up Serviços",
  description: "Quais cookies e dados no navegador o Portal Up Serviços usa, e para quê.",
};

const ITENS = [
  {
    nome: "Sessão de login",
    tipo: "Cookie",
    para: "Manter você conectado depois de entrar com login e senha.",
    prazo: "Até sair do portal, ou no máximo 30 dias.",
  },
  {
    nome: "Lembrar meu login",
    tipo: "Armazenamento do navegador",
    para: "Preencher o login na próxima entrada, só se você marcar a opção.",
    prazo: "Até você desmarcar a opção ou limpar os dados do navegador.",
  },
  {
    nome: "Tema da tela",
    tipo: "Armazenamento do navegador",
    para: "Lembrar se você escolheu o tema claro ou o escuro.",
    prazo: "Até limpar os dados do navegador.",
  },
  {
    nome: "Proteção do login",
    tipo: "Armazenamento da aba",
    para: "Contar as tentativas de senha erradas e pausar novas tentativas por 30 segundos.",
    prazo: "Some ao fechar a aba.",
  },
] as const;

const link = "font-semibold text-brand-green underline underline-offset-2";

export default function CookiesPage() {
  return (
    <PaginaLegal titulo="Política de Cookies" atualizadaEm={ATUALIZADA_EM} atual="/cookies">
      <SecaoLegal titulo="O que são cookies">
        <p>
          Cookies são pequenos arquivos que um site guarda no seu navegador. O navegador também tem outros espaços
          parecidos, chamados de armazenamento local. Esta página explica tudo o que o Portal Up Serviços guarda no
          seu navegador e para quê.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="O que usamos">
        <p>
          O portal usa <strong className="text-white">apenas o necessário para funcionar</strong>. Não usamos cookies
          de publicidade, de redes sociais nem de medição de audiência, e nenhum cookie de terceiros.
        </p>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[32rem] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-white">
                <th className="py-2 pr-3 font-semibold">Item</th>
                <th className="py-2 pr-3 font-semibold">Onde fica</th>
                <th className="py-2 pr-3 font-semibold">Para quê</th>
                <th className="py-2 font-semibold">Por quanto tempo</th>
              </tr>
            </thead>
            <tbody>
              {ITENS.map((item) => (
                <tr key={item.nome} className="border-b border-white/5 align-top">
                  <td className="py-2 pr-3 text-white">{item.nome}</td>
                  <td className="py-2 pr-3">{item.tipo}</td>
                  <td className="py-2 pr-3">{item.para}</td>
                  <td className="py-2">{item.prazo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Como são todos necessários, o portal não pede consentimento para usá-los. Se um dia passarmos a usar algum
          cookie que não seja necessário, esta página será atualizada e o portal pedirá a sua autorização antes.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="Registro de uso do portal">
        <p>
          Para entender como o sistema é usado, o portal registra a entrada e as telas abertas. Esse registro fica
          no banco de dados da Up Serviços, não em cookie, e é apagado depois de 12 meses, como explica a{" "}
          <Link href="/privacidade" className={link}>
            Política de Privacidade
          </Link>
          .
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="No aplicativo">
        <p>
          O aplicativo Up Serviços Inspeção não usa cookies. Ele guarda a sua sessão de forma criptografada no
          aparelho e mantém no celular as inspeções feitas sem internet até conseguir enviá-las.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="Como controlar">
        <p>
          Você pode apagar ou bloquear cookies e dados de sites nas configurações do seu navegador. Bloquear o
          cookie da sessão de login impede de entrar no portal; apagar os outros itens só desfaz as preferências.
        </p>
        <p>
          Dúvidas podem ser enviadas ao <LinkDoSuporte />.
        </p>
      </SecaoLegal>
    </PaginaLegal>
  );
}
