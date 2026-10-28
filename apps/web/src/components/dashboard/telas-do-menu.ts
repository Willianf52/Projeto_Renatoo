import {
  BarChartIcon,
  BuildingIcon,
  ClipboardListIcon,
  GridIcon,
  KeyIcon,
  MegaphoneIcon,
  PieChartIcon,
  PlusCircleIcon,
  PrinterIcon,
  QrCodeIcon,
  SearchIcon,
  SitemapIcon,
  SlidersIcon,
  UserIcon,
  UsersIcon,
} from "./icons";

/**
 * As telas do painel, na ordem e com os nomes do menu do sistema de
 * referencia. Fonte unica para a `DashboardSidebar` e para os atalhos da
 * Pagina Principal (`app/dashboard/principal`), que lista exatamente estas
 * telas -- uma tela nova entra no menu e passa a poder virar atalho no mesmo
 * lugar.
 *
 * Organizacao de 05/11/2026 (decisao do dono em 28/10): o sistema de
 * referencia reorganiza os menus nesse dia, pelo "Guia de navegacao dos
 * menus" dele. Cada modulo passa a ter "Configuracoes" (os cadastros), as
 * telas de uso e "Relatorios"; "Cadastros" vira "Configuracoes", Trocar Senha
 * vai para Suporte, Coletas Importadas entra em Inspecoes > Relatorios, e a
 * ordem dos modulos passa a ser Configuracoes, ChecklistLab, Eventos,
 * Inspecoes, Suporte. Os ENDERECOS das telas nao mudaram (links salvos e
 * atalhos seguem abrindo); so o lugar no menu e a trilha de cada tela.
 */

export type IconComponent = (props: { className?: string }) => React.ReactElement;

export type NavLink = {
  label: string;
  href: string;
  icon: IconComponent;
  /**
   * So aparece para o GESTOR, no menu e nos atalhos da Pagina Principal: as
   * telas que, no sistema de referencia, so existem no menu do GESTOR (issue
   * #209). Esconder aqui e so a vitrine: o portao de verdade e o `layout.tsx`
   * de cada pasta (`SomenteGestor`) e as policies do banco.
   */
  somenteGestor?: boolean;
  /** `href` fora do painel (o WhatsApp do Suporte Tecnico): abre em outra
   * aba e nao vira atalho da Pagina Principal. */
  externo?: boolean;
};

/** Sub-secao dentro de um item do menu, como "Relatorios" dentro de
 * "Inspecoes" -- um segundo nivel de agrupamento, com seu proprio toggle. */
export type NavGroup = {
  label: string;
  icon: IconComponent;
  items: NavLink[];
};

export type NavChild = NavLink | NavGroup;

/**
 * Secao de primeiro nivel. Com `href`, e um link direto (a "Pagina
 * Principal", como no sistema de referencia); sem, abre os `children`.
 */
export type NavItem = {
  label: string;
  icon: IconComponent;
  href?: string;
  /** `href` fora do painel (o WhatsApp do Suporte): abre em outra aba e nao
   * vira atalho da Pagina Principal. */
  externo?: boolean;
  children: NavChild[];
};

/**
 * "Suporte Tecnico", dentro do menu Suporte, como na organizacao de 05/11 do
 * sistema de referencia. La o link e do fornecedor antigo; aqui, o
 * atendimento por WhatsApp que o dono definiu (auditoria de 12/10/2026).
 *
 * O endereco vem de `NEXT_PUBLIC_URL_SUPORTE` (Vercel), e nao do codigo: o
 * repositorio e publico, e o numero nao precisa ficar no GitHub. Sem a
 * variavel -- ou com algo que nao seja https --, o item some, em vez de
 * aparecer como link morto; o menu Suporte fica com Trocar Senha.
 *
 * A "Central de Ajuda" do guia do sistema de referencia nao entra: e conteudo
 * do fornecedor, e o painel nao tem tela de ajuda.
 */
export function linkDoSuporteTecnico(url: string | undefined): NavLink | null {
  const endereco = url?.trim();
  if (!endereco || !/^https:\/\/\S+$/.test(endereco)) return null;
  return { label: "Suporte Técnico", href: endereco, icon: UserIcon, externo: true };
}

// Literal `process.env.NEXT_PUBLIC_...`: e assim que o Next troca pelo valor
// no build do bundle do navegador (a sidebar e client component).
const SUPORTE_TECNICO = linkDoSuporteTecnico(process.env.NEXT_PUBLIC_URL_SUPORTE);

export const isGroup = (child: NavChild): child is NavGroup => "items" in child;

export const NAV_ITEMS: NavItem[] = [
  { label: "Página Principal", href: "/dashboard/principal", icon: GridIcon, children: [] },
  {
    // Era "Cadastros". Ordem do guia de 05/11: Usuarios, Grupo de Usuarios,
    // Site / Planta, Grupo de Sites, QR-Code (os outros itens de la sao de
    // modulos que a empresa nao usa).
    label: "Configurações",
    icon: SlidersIcon,
    children: [
      { label: "Usuários", href: "/dashboard/cadastros/usuarios", icon: UserIcon },
      {
        label: "Grupo de Usuários",
        href: "/dashboard/cadastros/grupo-de-usuarios",
        icon: UsersIcon,
      },
      { label: "Site / Planta", href: "/dashboard/cadastros/site-planta", icon: BuildingIcon },
      { label: "Grupo de Sites", href: "/dashboard/cadastros/grupo-de-sites", icon: SitemapIcon },
      { label: "QR-Code", href: "/dashboard/cadastros/qr-code", icon: QrCodeIcon },
    ],
  },
  {
    label: "ChecklistLab",
    icon: ClipboardListIcon,
    children: [
      // O editor voltou em 16/10/2026 (issue #209, revendo a decisao de 01/10
      // que tirou as telas na #155). Era o subgrupo "Administracao"; no guia
      // de 05/11 e "Configuracoes", na ordem Grupo Perguntas, Criar Checklist.
      // As perguntas de cada checklist abrem pela linha dele em Criar Checklist.
      {
        label: "Configurações",
        icon: SlidersIcon,
        items: [
          {
            label: "Grupo Perguntas",
            href: "/dashboard/checklistlab/grupo-perguntas",
            icon: GridIcon,
            somenteGestor: true,
          },
          {
            label: "Criar Checklist",
            href: "/dashboard/checklistlab/modelos",
            icon: ClipboardListIcon,
            somenteGestor: true,
          },
        ],
      },
      {
        label: "Histórico de Checklist",
        href: "/dashboard/checklistlab/historico-de-checklist",
        icon: ClipboardListIcon,
      },
      {
        label: "Relatórios",
        icon: PrinterIcon,
        items: [
          {
            label: "Analítico por Checklist",
            href: "/dashboard/checklistlab/relatorios/analitico-por-checklist",
            icon: ClipboardListIcon,
            somenteGestor: true,
          },
          {
            label: "Indicadores por Site",
            href: "/dashboard/checklistlab/relatorios/indicadores-por-site",
            icon: PieChartIcon,
            somenteGestor: true,
          },
          {
            label: "Detalhamento do Checklist",
            href: "/dashboard/checklistlab/relatorios/detalhamento-do-checklist",
            icon: BarChartIcon,
            somenteGestor: true,
          },
        ],
      },
    ],
  },
  {
    label: "Eventos",
    icon: MegaphoneIcon,
    children: [
      // Os tres cadastros, que antes ficavam soltos no modulo, entram em
      // "Configuracoes" (guia de 05/11), na ordem de la. Todos do GESTOR
      // (issue #209).
      {
        label: "Configurações",
        icon: SlidersIcon,
        items: [
          {
            label: "Tipos de Análise",
            href: "/dashboard/eventos/tipos-de-analise",
            icon: SlidersIcon,
            somenteGestor: true,
          },
          {
            label: "Tipos de Classificação",
            href: "/dashboard/eventos/tipos-de-classificacao",
            icon: SlidersIcon,
            somenteGestor: true,
          },
          {
            label: "Cadastro de Eventos",
            href: "/dashboard/eventos/cadastro-de-eventos",
            icon: MegaphoneIcon,
            somenteGestor: true,
          },
        ],
      },
      {
        label: "Registrar Evento",
        href: "/dashboard/eventos/registrar-evento",
        icon: PlusCircleIcon,
        somenteGestor: true,
      },
      {
        label: "Painel de Eventos",
        href: "/dashboard/eventos/painel-de-eventos",
        icon: ClipboardListIcon,
        // So o item do menu: a tela segue aberta ao SUPERVISOR pela lupa do
        // Registro de Eventos, como no sistema de referencia, porque ele
        // analisa e finaliza ocorrencias (0064).
        somenteGestor: true,
      },
      {
        label: "Relatórios",
        icon: PrinterIcon,
        items: [
          {
            label: "Registro de Eventos",
            href: "/dashboard/eventos/relatorios/registro-de-eventos",
            icon: ClipboardListIcon,
          },
          {
            label: "Mapa de Eventos",
            href: "/dashboard/eventos/relatorios/mapa-de-eventos",
            icon: BarChartIcon,
          },
          {
            label: "Mapa de Eventos por Site",
            href: "/dashboard/eventos/relatorios/mapa-de-eventos-por-site",
            icon: BarChartIcon,
          },
          {
            label: "Eventos por Site",
            href: "/dashboard/eventos/relatorios/eventos-por-site",
            icon: BarChartIcon,
          },
          {
            label: "Gráficos de Eventos",
            href: "/dashboard/eventos/relatorios/graficos-de-eventos",
            icon: PieChartIcon,
          },
          {
            label: "Tempo Médio de Resolução das Não Conformidades",
            href: "/dashboard/eventos/relatorios/tempo-medio-resolucao-nao-conformidades",
            icon: BarChartIcon,
          },
          {
            label: "Ranking das Não Conformidades",
            href: "/dashboard/eventos/relatorios/ranking-nao-conformidades",
            icon: BarChartIcon,
          },
          {
            label: "Analítico de Eventos",
            href: "/dashboard/eventos/relatorios/analitico-de-eventos",
            icon: ClipboardListIcon,
            somenteGestor: true,
          },
          {
            label: "Gráficos por Classificação",
            href: "/dashboard/eventos/relatorios/graficos-por-classificacao",
            icon: BarChartIcon,
            somenteGestor: true,
          },
        ],
      },
    ],
  },
  {
    label: "Inspeções",
    icon: SearchIcon,
    children: [
      {
        label: "Relatórios",
        icon: PrinterIcon,
        items: [
          // Saiu do primeiro nivel do modulo: no guia de 05/11 e
          // Inspecoes > Relatorios > Coletas Importadas.
          {
            label: "Coletas Importadas",
            href: "/dashboard/inspecoes/coletas-importadas",
            icon: ClipboardListIcon,
          },
          {
            label: "Visitas de Supervisão",
            href: "/dashboard/inspecoes/relatorios/visitas-de-supervisao",
            icon: PieChartIcon,
          },
          {
            label: "Registro das Rondas Por Tempo de Permanência",
            href: "/dashboard/inspecoes/relatorios/registro-de-rondas",
            icon: ClipboardListIcon,
          },
          {
            label: "Ranking de Inspeções",
            href: "/dashboard/inspecoes/relatorios/ranking-de-inspecoes",
            icon: BarChartIcon,
          },
          {
            label: "Mapa de Quantidade de Locais Inspecionados",
            href: "/dashboard/inspecoes/relatorios/mapa-de-locais-inspecionados",
            icon: ClipboardListIcon,
          },
          {
            label: "Quantidade de Horas por Usuário",
            href: "/dashboard/inspecoes/relatorios/horas-por-usuario",
            icon: ClipboardListIcon,
          },
          {
            label: "Inspeções com Início e Fim de Visita",
            href: "/dashboard/inspecoes/relatorios/inspecoes-inicio-fim-visita",
            icon: ClipboardListIcon,
          },
        ],
      },
    ],
  },
  {
    // Era so o link do WhatsApp; no guia de 05/11 e um menu, com Trocar Senha
    // (que saiu de Cadastros).
    label: "Suporte",
    icon: UserIcon,
    children: [
      ...(SUPORTE_TECNICO ? [SUPORTE_TECNICO] : []),
      { label: "Trocar Senha", href: "/dashboard/cadastros/trocar-senha", icon: KeyIcon },
    ],
  },
];

/**
 * A rota do item ou qualquer rota ABAIXO dela (`/novo`, `/[id]/editar`,
 * `/export/pdf`). Com o limite de segmento, e nao `startsWith` puro: sem ele
 * `/mapa-de-eventos-por-site` comeca com `/mapa-de-eventos`, e abrir o
 * primeiro marcava os dois itens no menu.
 *
 * `pathname` so existe depois da hidratacao: na casca estatica ele e null e
 * nenhum item aparece marcado.
 */
export const naRota = (pathname: string | null, href: string) =>
  pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));

/** Uma tela que pode virar atalho: o link e a secao do menu onde ela mora. */
export type TelaDoMenu = NavLink & { secao: string };

/**
 * Todas as telas do menu, achatadas, na ordem do menu. A "Pagina Principal"
 * e a propria secao, como no sistema de referencia.
 */
export const TELAS_DO_MENU: TelaDoMenu[] = NAV_ITEMS.filter((item) => !item.externo).flatMap((item) => [
  ...(item.href ? [{ label: item.label, href: item.href, icon: item.icon, secao: item.label }] : []),
  ...item.children
    .flatMap((child) => (isGroup(child) ? child.items : [child]))
    .filter((link) => !link.externo)
    .map((link) => ({ ...link, secao: item.label })),
]);

const visivel = (link: NavLink, ehGestor: boolean) => ehGestor || !link.somenteGestor;

/**
 * O menu de quem esta logado: sem os itens `somenteGestor` para quem nao e
 * GESTOR, e sem o subgrupo que ficar vazio (as "Configuracoes" do ChecklistLab e de
 * Eventos).
 * Uma secao de primeiro nivel nunca some: as que tem item de GESTOR tambem tem
 * itens de todos.
 */
export function itensDoMenu(itens: NavItem[], ehGestor: boolean): NavItem[] {
  if (ehGestor) return itens;
  return itens.map((item) => ({
    ...item,
    children: item.children.flatMap((child): NavChild[] => {
      if (!isGroup(child)) return visivel(child, ehGestor) ? [child] : [];
      const items = child.items.filter((link) => visivel(link, ehGestor));
      return items.length > 0 ? [{ ...child, items }] : [];
    }),
  }));
}

/** As telas que podem virar atalho na Pagina Principal de quem esta logado. */
export function telasDoMenu(ehGestor: boolean): TelaDoMenu[] {
  return TELAS_DO_MENU.filter((tela) => visivel(tela, ehGestor));
}
