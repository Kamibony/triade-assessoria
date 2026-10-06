# Manual do Administrador

Bem-vindo ao Painel Administrativo. Este manual é destinado a administradores do sistema e testadores com acesso total. Aqui, detalhamos como operar a suíte administrativa completa, responsável por monitorar, gerenciar e auditar todo o ecossistema de dados e processos de matchmaking da plataforma.

## Visão Geral do Admin

O Painel de Administração (`/admin`) é o coração operacional do sistema. Através de um menu lateral fixo, organizado em "Visão Geral & Monitoramento", "Rede de OSCs" e "Ecossistema de Dados", você tem acesso ao controle total sobre o ciclo de vida da informação: desde a captação automatizada de novos editais na web até a aprovação final de um "match" recomendado pela Inteligência Artificial.

## Radar de Ingestão

O **Radar de Ingestão** (Acessível em *Ecossistema de Dados > Radar de Ingestão*) é o centro de controle dos processos de raspagem de dados (scraping) que rodam em background.

- **Monitoramento de Jobs:** A interface exibe os últimos processos de ingestão e seus status (Executando, Sucesso, Falha). É possível acompanhar os horários de início de cada varredura.
- **Sincronização Global:** Através do botão "Sincronização Global" (ou Forçar Execução), você pode disparar manualmente o gatilho que inicia uma nova rodada de busca por editais em todas as fontes configuradas no sistema simultaneamente.

## Diretório de Editais

O **Diretório de Editais** (Acessível em *Visão Geral & Monitoramento > Diretório de Editais*) é a base de dados mestre de oportunidades capturadas pela plataforma.

- **Visualização:** Lista todos os editais disponíveis no sistema de forma cronológica (com prioridade para os mais recentes/atualizados). A tabela mostra Título, Emissor, Data de Publicação, Prazo e Orçamento.
- **Filtros e Busca:** Permite pesquisar editais específicos utilizando a barra de busca e fornece recursos para filtragem detalhada.
- **A Tag "NOVO":** Editais recém-adicionados ou que sofreram atualizações recentes significativas em relação à data de criação recebem automaticamente uma etiqueta azul **"NOVO"** ao lado do título, ajudando a identificar rapidamente as oportunidades frescas no catálogo.

## Dashboard de Matches (V2)

O **Dashboard de Matches** (Acessível em *Visão Geral & Monitoramento > Matriz de Matches Global*) é a ferramenta de curadoria onde os administradores revisam o trabalho da Inteligência Artificial.

- **Métricas de Resumo:** O topo do painel exibe o "Total de Matches" gerados, bem como contagens segmentadas por status: Pendentes, Aprovados e Reprovados.
- **Filtros de Visão:** Você pode alternar a visualização clicando nos cartões de métricas do topo:
  - O filtro padrão oculta os rejeitados.
  - Selecionar "Pendentes" lista apenas os matches que aguardam revisão humana.
  - Selecionar "Aprovados" ou "Rejeitados" lista os respectivos históricos.
- **Avaliações da IA e Ação Manual:** Cada linha ou cartão na tabela mostra o Score percentual e a justificativa da IA. O administrador utiliza os botões de ação ("Aprovar" verde ou "Rejeitar" vermelho) para validar ou descartar a recomendação manualmente, atualizando o status do match.
- **Rejeição Global:** É possível invalidar e rejeitar globalmente todos os matches associados a um edital específico de uma só vez.

## Gestão Geral

O sistema permite administrar não apenas os editais, mas também o perfil das organizações.

- **Gerenciando Perfis (Diretório de OSCs):** Acesso a toda a rede de OSCs cadastradas, permitindo visualização de perfis, atualizações manuais e processos de onboarding VIP ou importação em massa.
- **Caçador de OSCs (Geração Manual de Matches):** Acessível em *Visão Geral & Monitoramento > Caçador de OSCs*, esta ferramenta permite que o administrador selecione uma janela de datas e acione o processamento manual de matches (Machine Learning Pipeline) contra os editais daquele período específico, forçando o sistema a calcular novas recomendações e "caçar" oportunidades para as OSCs da base.