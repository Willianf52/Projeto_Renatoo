import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/HeroPanel";

/**
 * Politica de privacidade do portal e do app de campo, publica (sem login).
 *
 * Existe porque a Play Store e a App Store pedem o endereco de uma politica de
 * privacidade para publicar o app (pendencia das lojas, 26/10/2026). O texto
 * segue `docs/lgpd-privacidade.md`: o que muda la (dado novo, fornecedor novo,
 * prazo de retencao decidido) muda aqui tambem.
 *
 * O canal de pedidos e o mesmo "Suporte" do menu (`NEXT_PUBLIC_URL_SUPORTE`,
 * na Vercel): o repositorio e publico, e o numero nao fica no codigo.
 */

/**
 * Quem responde pelos dados (controlador, LGPD). Decisao do dono, 26/10/2026:
 * a empresa. O CNPJ ainda nao era conhecido; a LGPD pede identificar o
 * controlador e o canal de contato, nao o numero, entao a frase sai sem ele
 * ate alguem preencher aqui.
 */
const RESPONSAVEL: { razaoSocial: string; cnpj: string | null } = {
  razaoSocial: "Up Serviços Especializados",
  cnpj: null,
};

const ATUALIZADA_EM = "26/10/2026";

const URL_SUPORTE = process.env.NEXT_PUBLIC_URL_SUPORTE?.trim();

export const metadata: Metadata = {
  title: "Política de Privacidade - Up Serviços",
  description: "Como o Portal Up Serviços e o app Up Serviços Inspeção tratam os dados pessoais.",
};

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-white">{titulo}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-brand-muted">{children}</div>
    </section>
  );
}

export default function PrivacidadePage() {
  const temSuporte = URL_SUPORTE !== undefined && /^https:\/\/\S+$/.test(URL_SUPORTE);

  return (
    <main className="min-h-screen bg-brand-navy px-4 py-10 sm:px-6">
      <article className="mx-auto w-full max-w-3xl">
        <BrandLogo size="sm" />

        <h1 className="mt-8 text-2xl font-bold text-white">Política de Privacidade</h1>
        <p className="mt-1 text-xs text-brand-muted">Atualizada em {ATUALIZADA_EM}</p>

        <Secao titulo="Quem somos">
          <p>
            Esta política explica como {RESPONSAVEL.razaoSocial}
            {RESPONSAVEL.cnpj ? `, CNPJ ${RESPONSAVEL.cnpj},` : ""} (&quot;Up Serviços&quot;) trata
            os dados pessoais no Portal Up Serviços (portalupservicos.com.br) e
            no aplicativo Up Serviços Inspeção. A Up Serviços é a responsável (controladora) por esses
            dados, nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018).
          </p>
          <p>
            O portal e o aplicativo são ferramentas de trabalho. Não há cadastro aberto ao público: as
            contas são criadas pela Up Serviços para seus funcionários e para os clientes que contratam
            os serviços.
          </p>
        </Secao>

        <Secao titulo="Quais dados tratamos">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-white">Dados da conta:</strong> nome, e-mail, login e cargo.
            </li>
            <li>
              <strong className="text-white">Dados das inspeções:</strong> o local inspecionado, a data e
              a hora da leitura do QR code, as respostas do checklist, as observações, as fotos tiradas
              durante a visita, a assinatura e as ocorrências registradas.
            </li>
            <li>
              <strong className="text-white">Uso do portal:</strong> o registro de entrada e das telas
              abertas, guardado por 12 meses, para entender como o sistema é usado.
            </li>
            <li>
              <strong className="text-white">Diagnóstico de erros:</strong> quando o portal ou o
              aplicativo falham, registramos a mensagem de erro, a versão do aplicativo e o modelo e o
              sistema do aparelho, sem o conteúdo dos formulários.
            </li>
          </ul>
          <p>
            O aplicativo usa a câmera apenas para ler o QR code do local e para tirar as fotos da
            inspeção. Ele não coleta localização, contatos, áudio nem outros arquivos do aparelho.
          </p>
        </Secao>

        <Secao titulo="Para que usamos os dados">
          <ul className="list-disc space-y-2 pl-5">
            <li>Registrar e comprovar as inspeções feitas nos locais atendidos.</li>
            <li>Gerar os relatórios e indicadores para a Up Serviços e para os clientes contratantes.</li>
            <li>Enviar avisos por e-mail, como a abertura de uma ocorrência e a recuperação de senha.</li>
            <li>Manter a segurança das contas e corrigir falhas do sistema.</li>
          </ul>
          <p>
            O tratamento se apoia na execução do contrato de trabalho ou de prestação de serviços e no
            legítimo interesse da Up Serviços em comprovar o serviço prestado.
          </p>
        </Secao>

        <Secao titulo="Com quem compartilhamos">
          <p>
            Cada cliente contratante vê apenas as inspeções dos próprios locais. Não vendemos dados
            pessoais e não os usamos para publicidade.
          </p>
          <p>
            Para funcionar, o sistema usa fornecedores que tratam os dados em nome da Up Serviços:
            Supabase (banco de dados e login), Vercel (hospedagem do portal), Resend (envio de
            e-mails), Sentry (registro de erros), Cloudflare (cópias de segurança) e Expo (atualizações
            do aplicativo). Alguns desses serviços ficam fora do Brasil, o que caracteriza
            transferência internacional de dados.
          </p>
        </Secao>

        <Secao titulo="Segurança">
          <p>
            Os dados trafegam por conexão criptografada. Cada pessoa só acessa o que o seu cargo
            permite, e as cópias de segurança do banco são guardadas criptografadas.
          </p>
        </Secao>

        <Secao titulo="Por quanto tempo guardamos">
          <p>
            Os dados da conta ficam guardados enquanto a conta existir. Os dados das inspeções ficam
            pelo tempo necessário para cumprir os contratos com os clientes e as obrigações legais. O
            registro de uso do portal é apagado depois de 12 meses.
          </p>
        </Secao>

        <Secao titulo="Seus direitos">
          <p>
            Você pode pedir a confirmação de que tratamos seus dados, o acesso a eles, a correção, a
            anonimização ou a eliminação do que for desnecessário, informações sobre com quem eles são
            compartilhados e a revogação de um consentimento, quando for o caso.
          </p>
          <p>
            {temSuporte ? (
              <>
                Para fazer um pedido, fale com o{" "}
                <a
                  href={URL_SUPORTE}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-brand-green underline underline-offset-2"
                >
                  suporte da Up Serviços
                </a>
                .
              </>
            ) : (
              <>Para fazer um pedido, fale com o suporte da Up Serviços.</>
            )}{" "}
            Respondemos em até 15 dias.
          </p>
        </Secao>

        <Secao titulo="Mudanças nesta política">
          <p>
            Quando esta política mudar, a data no topo da página será atualizada. Mudanças importantes
            também serão avisadas no portal.
          </p>
        </Secao>

        <p className="mt-10">
          <Link href="/" className="text-sm font-semibold text-brand-green underline underline-offset-2">
            Ir para o portal
          </Link>
        </p>
      </article>
    </main>
  );
}
