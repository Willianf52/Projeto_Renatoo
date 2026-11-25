import type { Metadata } from "next";
import Link from "next/link";
import { LinkDoSuporte, PaginaLegal, SecaoLegal } from "@/components/legal/PaginaLegal";

/**
 * Termos de Uso do portal e do app de campo, publicos (pedido do dono,
 * 25/11/2026). Escritos a partir do que o sistema faz de verdade: contas
 * criadas pela empresa, registro de autor e hora, app que guarda sem internet.
 * Revisao juridica fica com a empresa; quando mudar, mudar a data.
 */
const ATUALIZADA_EM = "25/11/2026";

export const metadata: Metadata = {
  title: "Termos de Uso - Up Serviços",
  description: "Regras de uso do Portal Up Serviços e do app Up Serviços Inspeção.",
};

const link = "font-semibold text-brand-green underline underline-offset-2";

export default function TermosPage() {
  return (
    <PaginaLegal titulo="Termos de Uso" atualizadaEm={ATUALIZADA_EM} atual="/termos">
      <SecaoLegal titulo="Sobre estes termos">
        <p>
          Estes termos valem para o Portal Up Serviços (portalupservicos.com.br) e para o aplicativo Up Serviços
          Inspeção, oferecidos pela Up Serviços Especializados (&quot;Up Serviços&quot;). Ao entrar no portal ou no
          aplicativo, você concorda com eles e com a{" "}
          <Link href="/privacidade" className={link}>
            Política de Privacidade
          </Link>
          .
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="Quem pode usar">
        <p>
          O portal e o aplicativo são ferramentas de trabalho. Não há cadastro aberto ao público: as contas são
          criadas pela Up Serviços para seus funcionários e para os clientes que contratam os serviços. Cada conta é
          pessoal e intransferível, e o que cada pessoa vê depende do cargo e dos locais ligados a ela.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="Suas responsabilidades">
        <ul className="list-disc space-y-2 pl-5">
          <li>Guardar a sua senha e não emprestar o seu acesso a ninguém.</li>
          <li>
            Registrar informações verdadeiras: leituras de QR code, respostas de checklist, fotos, assinaturas,
            ocorrências e quilometragem devem corresponder ao que aconteceu no local.
          </li>
          <li>Usar o sistema só para as atividades de trabalho ligadas à Up Serviços.</li>
          <li>
            Avisar o <LinkDoSuporte /> assim que perceber uso indevido da sua conta ou perda do aparelho com o
            aplicativo.
          </li>
        </ul>
      </SecaoLegal>

      <SecaoLegal titulo="O que não é permitido">
        <ul className="list-disc space-y-2 pl-5">
          <li>Tentar acessar dados, telas ou contas que o seu cargo não permite.</li>
          <li>Burlar, testar ou desativar as proteções do sistema.</li>
          <li>Registrar inspeções, fotos ou assinaturas falsas, ou feitas em nome de outra pessoa.</li>
          <li>Enviar conteúdo ilegal, ofensivo ou sem relação com o serviço.</li>
          <li>Copiar, revender ou usar o sistema por meios automatizados sem autorização da Up Serviços.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal titulo="Registros das inspeções">
        <p>
          Cada leitura, checklist, foto, assinatura e ocorrência fica registrada com o autor, a data e a hora,
          para comprovar o serviço prestado. Esses registros pertencem à Up Serviços e aos clientes contratantes,
          nos termos dos contratos entre eles, e podem ser usados em relatórios e auditorias.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="Disponibilidade">
        <p>
          A Up Serviços se esforça para manter o portal e o aplicativo funcionando, mas podem ocorrer interrupções
          para manutenção, atualização ou por falha de fornecedores e da conexão. O aplicativo guarda as leituras
          feitas sem internet e as envia quando o sinal volta. Recomendamos conferir o envio antes de desinstalar o
          aplicativo ou trocar de aparelho.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="Suspensão e encerramento da conta">
        <p>
          A Up Serviços pode desativar uma conta a qualquer momento, por exemplo no fim do vínculo de trabalho ou do
          contrato, ou em caso de uso que descumpra estes termos. Os dados da conta seguem o que diz a Política de
          Privacidade.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="Propriedade">
        <p>
          O portal, o aplicativo, a marca e o conteúdo das telas pertencem à Up Serviços. O uso do sistema não
          transfere nenhum desses direitos a quem o utiliza.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="Privacidade e cookies">
        <p>
          O tratamento de dados pessoais está descrito na{" "}
          <Link href="/privacidade" className={link}>
            Política de Privacidade
          </Link>
          , e o uso de cookies, na{" "}
          <Link href="/cookies" className={link}>
            Política de Cookies
          </Link>
          .
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="Mudanças nestes termos">
        <p>
          Quando estes termos mudarem, a data no topo da página será atualizada. Mudanças importantes também serão
          avisadas no portal. Continuar usando o sistema depois da mudança significa concordar com a nova versão.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="Lei aplicável e contato">
        <p>
          Estes termos seguem as leis do Brasil. Dúvidas sobre eles podem ser enviadas ao <LinkDoSuporte />.
        </p>
      </SecaoLegal>
    </PaginaLegal>
  );
}
