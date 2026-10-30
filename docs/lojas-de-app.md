# Publicação nas lojas (Play Store e App Store)

Preparado em 26/10/2026. As contas de desenvolvedor são da **empresa** e
dependem do **D-U-N-S** do CNPJ, ainda não pedido nessa data. Este documento
junta o que a ficha das lojas pede, para não ser escrito às pressas quando as
contas existirem.

## O que já está pronto no projeto

| Item | Onde |
|---|---|
| Identificador do app: `br.com.upservicos.inspecao` (Android e iPhone) | `apps/mobile/app.json` |
| Build de loja: perfil `production` (Android em AAB, versão sobe sozinha) | `apps/mobile/eas.json` |
| Versão do app de loja: **1.2.0**, Expo SDK 58 (desde 28/10, #251). O primeiro build de loja é um build nativo novo, então já sai nela | `apps/mobile/app.json` |
| Variáveis do ambiente `production` do EAS, inclusive `EXPO_PUBLIC_URL_DO_PORTAL` (26/10) | painel do EAS |
| Textos de permissão da câmera em português | plugins `expo-camera` e `expo-image-picker` no `app.json` |
| iPhone: sem criptografia própria (`usesNonExemptEncryption: false`) e idioma base pt-BR | `apps/mobile/app.json` |
| Política de privacidade pública | https://portalupservicos.com.br/privacidade |
| Atualizações depois da loja: canal `production` | `pnpm run atualizar:producao` em `apps/mobile` |

## Ficha da loja (textos)

**Nome:** Up Serviços Inspeção

**Descrição curta** (até 80 caracteres):

> Inspeções da Up Serviços: QR code, checklist, fotos e assinatura no local.

**Descrição completa:**

> Aplicativo de uso interno da Up Serviços, para os supervisores e operadores registrarem as inspeções nos locais atendidos.
>
> Como funciona:
> • Leia o QR code do local e o checklist do lugar abre na hora.
> • Responda as perguntas, tire as fotos e colete a assinatura.
> • Sem sinal, a leitura fica guardada no aparelho e é enviada quando a internet voltar.
> • As ocorrências apontadas no checklist chegam ao portal e aos responsáveis por e-mail.
>
> O acesso é feito com a conta criada pela Up Serviços. Não há cadastro aberto ao público.

**Categoria:** Empresa (Play Store) / Negócios (App Store).

**E-mail de contato da ficha:** [a definir pela empresa: a Google exige um e-mail; pode ser diferente do suporte por WhatsApp].

**Política de privacidade:** https://portalupservicos.com.br/privacidade

## Arte que a empresa precisa fornecer

| Peça | Tamanho | Observação |
|---|---|---|
| Ícone da loja | 512 x 512 px, PNG | Hoje o app usa o ícone de 12/10; o logo em alta resolução ainda está pendente |
| Imagem de destaque (só Google) | 1024 x 500 px | Fundo azul da marca com o logo serve |
| Prints do celular | pelo menos 2 (Google) e 3 (Apple) | Tirados do app com dado de teste, nunca com cliente real. Os do iPhone (1320 x 2868) servem na Apple como estão; na Google a proporção máxima é 2:1, então as cópias da Google são recortadas. Pelo Expo Go, ocultar antes o botão flutuante de ferramentas (a engrenagem azul), que não faz parte do app. Os 6 prints da versão 1.2.0 foram tirados em 30/10 e ficam fora do repositório (pasta `paridade`) |
| Prints de tablet | opcional na Google; exigido na Apple se `supportsTablet` | Não se aplica: desde 30/10 o `app.json` não declara suporte a iPad, porque a empresa só usa celulares. Os prints de tablet da Google, opcionais, também não são feitos |

## Formulário de segurança de dados (Google Play)

Respostas conforme o código em 26/10/2026. Se o app passar a coletar algo novo,
revisar aqui, na política e em `docs/lgpd-privacidade.md`.

| Pergunta | Resposta |
|---|---|
| O app coleta ou compartilha dados do usuário? | Sim, coleta. Não compartilha com terceiros para outros fins (os fornecedores tratam em nome da empresa) |
| Dados criptografados em trânsito? | Sim (HTTPS) |
| O usuário pode pedir a exclusão dos dados? | Sim, pelo suporte (ver a política) |
| Informações pessoais | Nome, e-mail, IDs do usuário (login). Finalidade: funcionalidade do app, gerenciamento da conta. Obrigatório |
| Fotos e vídeos | Fotos (as da inspeção). Finalidade: funcionalidade do app. Obrigatório |
| Atividade no app | Interações no app (respostas do checklist, ocorrências). Finalidade: funcionalidade do app |
| Informações e desempenho do app | Registros de falhas e diagnóstico (Sentry). Finalidade: análise, correção de erros |
| Localização, contatos, áudio, arquivos, mensagens, saúde, financeiro | Não coleta |
| Exclusão de conta pelo próprio app | Não se aplica: as contas não são criadas no app, e sim pela empresa no portal |

**Classificação de conteúdo:** app de ferramenta de trabalho, sem conteúdo
sensível; responder o questionário como "Utilitário/Produtividade", sem
interação entre usuários nem compras.

**Acesso para a revisão da loja:** as duas lojas pedem uma conta para o
revisor entrar. Criar uma conta de teste só para isso (cargo INSPETOR, ligada ao
site `[TESTE] Posto Central`) e informar login e senha no formulário da loja,
sem gravar a senha no repositório.

## iPhone: atenção

App só para funcionários tende a ser recusado na App Store aberta (diretriz
de apps de uso empresarial). Caminho provável: **TestFlight** para o piloto e,
no definitivo, **Custom App** pelo Apple Business Manager (distribuição privada
para a empresa). Decidir quando a conta da Apple existir.

## Depois da primeira publicação

- Tablet com APK instalado por fora precisa **desinstalar** antes de instalar
  pela loja (a assinatura muda com o Play App Signing).
- As OTAs passam a ir também para o canal `production`
  (`atualizar:producao` e `atualizar:source-maps`).
