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
  UserIcon,
  UsersIcon,
} from "./icons";

/**
 * As telas do painel, na ordem e com os nomes do menu do sistema de
 * referencia. Fonte unica para a `DashboardSidebar` e para os atalhos da
 * Pagina Principal (`app/dashboard/principal`), que lista exatamente estas
 * telas -- uma tela nova entra no menu e passa a poder virar atalho no mesmo
 * lugar.
 */

export type IconComponent = (props: { className?: string }) => React.ReactElement;

export type NavLink = {
  label: string;
  href: string;
  icon: IconComponent;
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
  children: NavChild[];
};

export const isGroup = (child: NavChild): child is NavGroup => "items" in child;

export const NAV_ITEMS: NavItem[] = [
  { label: "Página Principal", href: "/dashboard/principal", icon: GridIcon, children: [] },
  {
    label: "Cadastros",
    icon: PlusCircleIcon,
    children: [
      { label: "Grupo de Sites", href: "/dashboard/cadastros/grupo-de-sites", icon: SitemapIcon },
      { label: "Site / Planta", href: "/dashboard/cadastros/site-planta", icon: BuildingIcon },
      { label: "Usuários", href: "/dashboard/cadastros/usuarios", icon: UserIcon },
      {
        label: "Grupo de Usuários",
        href: "/dashboard/cadastros/grupo-de-usuarios",
        icon: UsersIcon,
      },
      { label: "QR-Code", href: "/dashboard/cadastros/qr-code", icon: QrCodeIcon },
      { label: "Trocar Senha", href: "/dashboard/cadastros/trocar-senha", icon: KeyIcon },
    ],
  },
  {
    label: "Inspeções",
    icon: SearchIcon,
    children: [
      {
        label: "Coletas Importadas",
        href: "/dashboard/inspecoes/coletas-importadas",
        icon: ClipboardListIcon,
      },
      {
        label: "Relatórios",
        icon: PrinterIcon,
        items: [
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
    label: "Eventos",
    icon: MegaphoneIcon,
    children: [
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
        ],
      },
    ],
  },
  {
    label: "ChecklistLab",
    icon: ClipboardListIcon,
    children: [
      // Sem cadastro de modelos e perguntas no painel (decisao do dono em
      // 01/10/2026): as tabelas continuam (0042/0061) e o app segue lendo
      // delas, mas o conteudo entra por importacao, nao por tela.
      {
        label: "Histórico de Checklist",
        href: "/dashboard/checklistlab/historico-de-checklist",
        icon: ClipboardListIcon,
      },
    ],
  },
  // Modulos ainda sem telas definidas: mantidos visiveis para preservar a
  // estrutura de navegacao do sistema de referencia.
  { label: "Suporte", icon: UserIcon, children: [] },
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
export const TELAS_DO_MENU: TelaDoMenu[] = NAV_ITEMS.flatMap((item) => [
  ...(item.href ? [{ label: item.label, href: item.href, icon: item.icon, secao: item.label }] : []),
  ...item.children.flatMap((child) =>
    isGroup(child)
      ? child.items.map((link) => ({ ...link, secao: item.label }))
      : [{ ...child, secao: item.label }],
  ),
]);
