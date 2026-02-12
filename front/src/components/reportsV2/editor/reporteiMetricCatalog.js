const PLATFORM_AD_METRICS = new Set([
  "spend",
  "impressions",
  "clicks",
  "conversions",
  "revenue",
  "ctr",
  "cpc",
  "cpm",
  "cpa",
  "roas",
]);

const PLATFORM_GA4_METRICS = new Set(["sessions", "conversions", "leads", "revenue"]);

const META_ADS_LABELS = [
  "Acao de Visualizar o Conteudo",
  "Adicionados a Lista de Desejos",
  "Adicoes a Lista de Desejos em Aplicativos Mobile",
  "Adicoes ao carrinho",
  "Adicoes ao Carrinho em Aplicativos Mobile",
  "Adicoes ao carrinho no site",
  "Adicoes ao carrinho offline",
  "Alcance no Audience Networks",
  "Alcance no Facebook",
  "Alcance no Instagram",
  "Alcance no Messenger",
  "Alcance por plataforma",
  "Alcance Total",
  "Anuncios em destaque",
  "Aplicacoes enviadas no site",
  "Assinaturas Canceladas",
  "Assinaturas Canceladas em Aplicativos Mobile",
  "Assinaturas Canceladas no Site",
  "Assinaturas de Mensagens",
  "Assinaturas em Aplicativos Mobile",
  "Assinaturas no Site",
  "Assinaturas Offline",
  "Assinaturas Offline Canceladas",
  "Ativacoes de Aplicativos",
  "Ativacoes de aplicativos moveis",
  "Avaliacoes em Aplicativos Mobile",
  "Avaliacoes Enviadas",
  "Cadastros (leads) do Meta",
  "Cadastros (leads) no site",
  "Cadastros em Aplicativos Mobile",
  "Campanhas",
  "Campanhas em destaque",
  "Chamadas de 20 segundos Realizadas",
  "Chamadas de 60 segundos realizadas",
  "Chamadas Realizadas (Disponivel apenas em paises selecionados)",
  "Check-ins",
  "Cliques de Saida",
  "Cliques e CTR durante o tempo",
  "Cliques em Anuncios em Aplicativos Mobile",
  "Cliques no Facebook",
  "Cliques no Instagram",
  "Cliques no Link no Facebook",
  "Cliques no Link no Instagram",
  "Cliques nos Links",
  "Comentarios",
  "Compartilhamento da publicacao",
  "Compras",
  "Compras em Aplicativos Mobile",
  "Compras no Facebook",
  "Compras no Instagram",
  "Compras no site",
  "Conclusoes de Fluxo de Trabalho no Meta",
  "Conclusoes de Tutoriais em Aplicativos Mobile",
  "Conjunto de anuncios em destaque",
  "Conquistas Desbloqueadas",
  "Conquistas em Aplicativos Mobile",
  "Contatos no App Mobile",
  "Contatos Offline",
  "Conversas de Mensagens Bloqueadas",
  "Conversas iniciadas por mensagem",
  "Conversas iniciadas por mensagem (Facebook)",
  "Conversas iniciadas por mensagem (Instagram)",
  "Conversoes",
  "Conversoes e acoes por Plataforma",
  "Conversoes e acoes por Tipo",
  "CPC medio",
  "CPC Medio Total",
  "CPC no Facebook",
  "CPC no Instagram",
  "CPM medio",
  "CPM medio no Facebook",
  "CPM medio no Instagram",
  "CTR (Taxa de cliques no link)",
  "CTR (Taxa de cliques no link) no Facebook",
  "CTR (Todos) no Facebook",
  "CTR (Todos) no Instagram",
  "Custo por Adicao a Lista de Desejos",
  "Custo por adicoes ao carrinho",
  "Custo por adicoes ao carrinho no site",
  "Custo por Agendamentos Realizados",
  "Custo por Assinaturas",
  "Custo por Assinaturas Canceladas",
  "Custo por Cadastros (leads) do Meta",
  "Custo por cadastros (leads) no site",
  "Custo por Check-ins",
  "Custo por Clique em Links",
  "Custo por Comentarios em Postagens",
  "Custo por compra",
  "Custo por Compras",
  "Custo por Compras no Facebook",
  "Custo por compras no site",
  "Custo por Conversao",
  "Custo por conversas iniciadas por mensagem",
  "Custo por Doacoes",
  "Custo por Engajamento em Postagens",
  "Custo por Engajamento na Pagina",
  "Custo por Eventos Personalizados",
  "Custo por finalizacoes de compra iniciada",
  "Custo por Impressoes de Anuncios no Aplicativo",
  "Custo por inscricoes enviadas",
  "Custo por Instalacoes de Aplicativos",
  "Custo por Leads no Facebook provenientes do Messenger",
  "Custo por Niveis Alcancados",
  "Custo por Novas Conversas de Mensagens",
  "Custo por Pesquisas",
  "Custo por Produtos Personalizados",
  "Custo por seguidores ou curtidas",
  "Custo por Todos os cadastros (leads)",
  "Custo por visualizacao da landing page",
  "Custo por Visualizacao de Conteudo",
  "Custo total por contatos",
  "Doacoes",
  "Doacoes em aplicativos moveis",
  "Doacoes no Facebook",
  "Doacoes no site",
  "Doacoes offline",
  "Engajamento da pagina",
  "Engajamento de Publicacoes no Facebook",
  "Engajamento de Publicacoes no Instagram",
  "Engajamentos com a publicacao",
  "Eventos de Pixel Personalizados",
  "Eventos Personalizados",
  "Finalizacoes de Compra Iniciadas",
  "Finalizacoes de compras no Facebook",
  "Frequencia",
  "Frequencia no Facebook",
  "Frequencia no Instagram",
  "Gastos de credito",
  "Horas marcadas",
  "ID da Conta",
  "Impressoes e alcance por genero",
  "Impressoes e Alcance por hora",
  "Impressoes e alcance por idade",
  "Impressoes no Audience Networks",
  "Impressoes no Facebook",
  "Impressoes no Instagram",
  "Impressoes no Messenger",
  "Impressoes Totais",
  "Inscricoes enviadas",
  "Instalacoes do App",
  "Leads no Facebook provenientes do Messenger e Formularios Instantaneos",
  "Niveis Alcancados",
  "Nome da Conta",
  "Novos contatos de mensagem",
  "Numero de anuncios",
  "Numero de campanhas",
  "Registros concluidos",
  "Reproducao do video por 3 segundos",
  "Reproducoes de 100% do video",
  "Reproducoes de 25% do video",
  "Reproducoes de 50% do video",
  "Reproducoes de 75% do video",
  "Reproducoes de 95% do video",
  "Reproducoes de video",
  "Resumo das campanhas",
  "ROAS de Compras",
  "ROAS de Compras Facebook",
  "ROAS de Compras Instagram",
  "ROAS de Compras no Site",
  "Saldo atual da conta de anuncios",
  "Seguidores ou curtidas",
  "Sessoes de jogo",
  "Taxa de Engajamento no Facebook",
  "Taxa de Engajamento no Instagram",
  "Taxa de Engajamento Total",
  "Tempo medio de reproducao de video",
  "Testes iniciados",
  "Thruplays",
  "Todos os cadastros (leads)",
  "Total de Cliques",
  "Total de cliques no link",
  "Total de contatos",
  "Total de instalacoes do App",
  "Valor da Conversao da Compra no Site",
  "Valor de conversao de adicoes ao carrinho",
  "Valor de conversao dos gastos de credito",
  "Valor investido",
  "Valor Investido no Facebook",
  "Valor Investido no Instagram",
  "Valor investido no Messenger",
  "Valor investido por dia",
  "Visualizacoes da landing page",
  "Visualizacoes de conteudo",
  "Visualizacoes de conteudo no site",
  "Visualizacoes de foto",
];

const GA4_LABELS = [
  "ARPPU",
  "ARPU",
  "Campanha do primeiro usuario",
  "Carrinhos abandonados",
  "Cidades em destaque",
  "Compras",
  "Compras iniciadas",
  "Conferiu Produto",
  "Contagem de eventos por usuario ativo",
  "Desempenho das campanhas do Google Ads",
  "Desempenho dos produtos",
  "Evento ao longo do tempo",
  "Evento Principal",
  "Eventos por Campanha do Primeiro Usuario",
  "Eventos por conteudo de anuncio manual do primeiro usuario",
  "Eventos por midia atribuida ao primeiro usuario",
  "Eventos por origem de sessao",
  "Eventos por origem/midia de sessao",
  "Eventos por termo manual do primeiro usuario",
  "Genero do Visitante",
  "Grupo de canais padrao da sessao",
  "Grupo de Canal Padrao de Sessao por Campanhas",
  "Grupo principal de canais do primeiro usuario",
  "Itens comprados",
  "Jornada de Compra",
  "Jornada de Compra: Categoria do Dispositivo",
  "Novos compradores",
  "Novos usuarios",
  "Numero de eventos",
  "Origem e midia da sessao",
  "Origem/midia por evento",
  "Pagina de Destino",
  "Paginas mais acessadas",
  "Paises em destaque",
  "Plataforma de origem da sessao",
  "Principais origens das sessoes",
  "Quantidade adicionada ao carrinho",
  "Receita Bruta de Compra",
  "Receita de Compra",
  "Receita de Publicidade Total",
  "Receita media de compra",
  "Receita total",
  "Resultados da campanha",
  "Resumo dos eventos",
  "Resumo dos principais eventos",
  "ROAS",
  "Sessoes",
  "Sessoes engajadas",
  "Sessoes engajadas diretas",
  "Sessoes engajadas organicas",
  "Sessoes engajadas pagas",
  "Sessoes para transacao",
  "Sessoes por dispositivos",
  "Sessoes por grupo de canais padrao da sessao",
  "Sessoes por idade",
  "Taxa de adicoes ao carrinho por visualizacao",
  "Taxa de conversao do comercio eletronico",
  "Taxa de engajamento",
  "Taxa de engajamento direto",
  "Taxa de engajamento organico",
  "Taxa de engajamento pago",
  "Taxa de eventos principais da sessao",
  "Taxa de eventos principais do usuario",
  "Taxa de Rejeicao",
  "Tempo Medio de Engajamento por Sessoes",
  "Tempo Medio de Engajamento por usuario ativo",
  "Tempo Medio de Engajamento por Usuario Total",
  "Texto da palavra-chave do Google Ads atribuida a essa sessao",
  "Texto das palavra-chave do Google Ads",
  "Total de compradores",
  "Total de Usuarios",
  "Trafego de pesquisa organica do Google",
  "Trafego direto",
  "Trafego organico",
  "Trafego pago",
  "Transacoes",
  "Usuarios ao longo do tempo",
  "Usuarios Ativos",
  "Usuarios ativos diretos",
  "Usuarios ativos organicos",
  "Usuarios ativos pagos",
  "Usuarios ativos por dispositivo",
  "Usuarios ativos por grupo de canal padrao de sessao ao longo do tempo",
  "Usuarios Retornantes",
  "UTM Campanha",
  "UTM Conteudo",
  "UTM Meio",
  "UTM Origem",
  "UTM Termo",
  "Valor dos eventos",
  "Visualizacoes",
  "Visualizacoes por sessao",
  "Visualizacoes por titulo da pagina e classe da tela",
  "Visualizacoes por usuario ativo",
];

const GOOGLE_ADS_LABELS = [
  "Valor investido",
  "Impressoes",
  "Cliques",
  "CTR",
  "CPC medio",
  "CPM medio",
  "Conversoes",
  "CPA",
  "ROAS",
  "Custo por conversao",
  "Campanhas em destaque",
  "Conjunto de anuncios em destaque",
  "Anuncios em destaque",
  "Cliques e CTR durante o tempo",
  "Investimento por dia",
  "Impressao e alcance por hora",
  "Impressao e alcance por idade",
];

const TIKTOK_ADS_LABELS = [
  "Valor investido",
  "Impressoes totais",
  "Cliques",
  "CTR no link",
  "CPC",
  "CPM",
  "Conversoes",
  "CPA",
  "ROAS",
  "Video views",
  "Visualizacao 25 por cento",
  "Visualizacao 50 por cento",
  "Visualizacao 75 por cento",
  "Visualizacao 100 por cento",
  "Cliques por hora",
  "Campanhas em destaque",
];

const LINKEDIN_ADS_LABELS = [
  "Valor investido",
  "Impressoes",
  "Cliques",
  "CTR",
  "CPC",
  "CPM",
  "Leads",
  "Custo por lead",
  "Conversoes",
  "Taxa de conversao",
  "Alcance",
  "Engajamento",
  "Campanhas em destaque",
];

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferPrimaryMetric(label, platform) {
  const text = String(label || "").toLowerCase();
  const isGa4 = platform === "GA4";

  if (text.includes("ctr")) return "ctr";
  if (text.includes("cpc")) return "cpc";
  if (text.includes("cpm")) return "cpm";
  if (text.includes("roas")) return "roas";
  if (text.includes("impress")) return "impressions";
  if (text.includes("clique")) return "clicks";
  if (
    text.includes("receita") ||
    text.includes("revenue") ||
    text.includes("valor dos eventos") ||
    text.includes("valor da conversao")
  ) {
    return "revenue";
  }
  if (text.includes("lead") || text.includes("cadastro")) {
    return isGa4 ? "leads" : "conversions";
  }
  if (
    text.includes("convers") ||
    text.includes("compra") ||
    text.includes("transac") ||
    text.includes("assinatura") ||
    text.includes("contato") ||
    text.includes("mensagem") ||
    text.includes("checkout") ||
    text.includes("carrinho")
  ) {
    return "conversions";
  }
  if (
    text.includes("sess") ||
    text.includes("usuario") ||
    text.includes("evento") ||
    text.includes("origem") ||
    text.includes("utm") ||
    text.includes("canal") ||
    text.includes("trafego") ||
    text.includes("pagina") ||
    text.includes("cidade") ||
    text.includes("pais") ||
    text.includes("dispositivo")
  ) {
    return isGa4 ? "sessions" : "impressions";
  }
  if (
    text.includes("custo") ||
    text.includes("invest") ||
    text.includes("gasto") ||
    text.includes("spend")
  ) {
    return isGa4 ? "sessions" : "spend";
  }

  return isGa4 ? "sessions" : "spend";
}

function normalizeMetricForPlatform(metric, platform) {
  const key = String(metric || "").toLowerCase();
  if (platform === "GA4") {
    if (PLATFORM_GA4_METRICS.has(key)) return key;
    if (key === "roas" || key === "cpa") return "conversions";
    return "sessions";
  }
  if (PLATFORM_AD_METRICS.has(key)) return key;
  if (key === "sessions" || key === "leads") return "conversions";
  return "spend";
}

function inferGroup(label) {
  const text = String(label || "").toLowerCase();
  if (text.includes("custo") || text.includes("cpc") || text.includes("cpm")) {
    return "Investimento";
  }
  if (text.includes("clique") || text.includes("impress") || text.includes("alcance") || text.includes("frequenc")) {
    return "Alcance";
  }
  if (text.includes("receita") || text.includes("roas") || text.includes("valor")) {
    return "Receita";
  }
  if (
    text.includes("convers") ||
    text.includes("lead") ||
    text.includes("compra") ||
    text.includes("carrinho") ||
    text.includes("contato") ||
    text.includes("mensagem")
  ) {
    return "Conversoes";
  }
  if (
    text.includes("sess") ||
    text.includes("usuario") ||
    text.includes("origem") ||
    text.includes("utm") ||
    text.includes("canal")
  ) {
    return "Sessoes e usuarios";
  }
  return "Metricas da rede";
}

function inferWidgetConfig(label) {
  const text = String(label || "").toLowerCase();
  if (
    text.includes("durante o tempo") ||
    text.includes("ao longo do tempo") ||
    text.includes("por dia")
  ) {
    return { type: "timeseries", dimensions: ["date"] };
  }
  if (text.includes("por hora")) {
    return { type: "bar", dimensions: ["date"] };
  }
  if (text.includes("por plataforma")) {
    return { type: "pie", dimensions: ["platform"] };
  }
  if (
    text.includes("em destaque") ||
    text.includes("origem") ||
    text.includes("utm") ||
    text.includes("campanha") ||
    text.includes("anuncios") ||
    text.includes("conjunto de anuncios") ||
    text.includes("paginas") ||
    text.includes("paises") ||
    text.includes("cidades")
  ) {
    return { type: "table", dimensions: ["campaign_id"] };
  }
  return { type: "kpi", dimensions: [] };
}

function buildItemsFromLabels(labels, platform) {
  return labels.map((label, index) => {
    const inferred = inferPrimaryMetric(label, platform);
    const queryMetric = normalizeMetricForPlatform(inferred, platform);
    const widgetConfig = inferWidgetConfig(label);
    return {
      value: `${platform}:${slugify(label) || index}`,
      label,
      queryMetric,
      widgetType: widgetConfig.type,
      dimensions: widgetConfig.dimensions,
      group: inferGroup(label),
    };
  });
}

const CATALOG_BY_PLATFORM = {
  META_ADS: buildItemsFromLabels(META_ADS_LABELS, "META_ADS"),
  FB_IG: buildItemsFromLabels(META_ADS_LABELS, "FB_IG"),
  GOOGLE_ADS: buildItemsFromLabels(GOOGLE_ADS_LABELS, "GOOGLE_ADS"),
  TIKTOK_ADS: buildItemsFromLabels(TIKTOK_ADS_LABELS, "TIKTOK_ADS"),
  LINKEDIN_ADS: buildItemsFromLabels(LINKEDIN_ADS_LABELS, "LINKEDIN_ADS"),
  GA4: buildItemsFromLabels(GA4_LABELS, "GA4"),
};

export function getCatalogForPlatform(platform) {
  const normalized = String(platform || "").trim().toUpperCase();
  return CATALOG_BY_PLATFORM[normalized] || [];
}

export function getGroupedCatalogForPlatform(platform) {
  const metrics = getCatalogForPlatform(platform);
  const groupMap = new Map();

  metrics.forEach((metric) => {
    const key = metric.group || "Metricas";
    const current = groupMap.get(key) || [];
    current.push(metric);
    groupMap.set(key, current);
  });

  return Array.from(groupMap.entries()).map(([label, items], index) => ({
    key: `${slugify(label)}-${index}`,
    label,
    metrics: items,
  }));
}

