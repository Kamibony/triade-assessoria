# 1. Visão Geral do Sistema

A Tríade-Assessoria desenvolveu uma plataforma tecnológica robusta, projetada para automatizar de ponta a ponta o processo de descoberta, extração, estruturação e recomendação de editais de fomento e financiamento para Organizações da Sociedade Civil (OSCs).

Atuando como um "motor de busca e matchmaking inteligente", o sistema reduz drasticamente o trabalho manual na busca por oportunidades. Ele captura informações brutas de diversas fontes, as processa com Inteligência Artificial para extrair regras e critérios específicos e, por fim, cruza esses dados com os perfis das OSCs cadastradas para identificar as oportunidades de maior viabilidade (Match).

O resultado final é uma experiência simplificada em dashboards interativos que oferecem recomendações personalizadas, justificativas e suporte para o fluxo de captação de recursos, gerando enorme valor e escalabilidade para o setor.

---

# 2. Arquitetura de Nuvem (Infraestrutura)

Para suportar altos volumes de processamento, a plataforma foi arquitetada inteiramente em nuvem seguindo uma infraestrutura robusta, escalável e serverless.

Os componentes-chave da infraestrutura incluem:

- **Google Cloud Functions Gen 2:** A lógica de negócios, os scrapers (extratores) e os agentes de inteligência artificial rodam em Cloud Functions, permitindo escalabilidade automática.
- **Firebase Firestore:** O banco de dados NoSQL atua como o principal meio de armazenamento de perfis das OSCs e regras dos editais em tempo real.
- **Cloud Tasks:** Gerencia filas de processamento assíncrono (queuing). Isso evita gargalos de desempenho e assegura a resiliência em tarefas pesadas.
- **React/Vite (Frontend):** O painel voltado aos usuários é construído com React e Vite, garantindo alta performance e uma interface moderna para a gestão.

---

# 3. Pipeline de Ingestão de Dados (Como encontramos Editais)

O desafio de descobrir e compilar dados de editais pulverizados pela internet é solucionado por um processo de *scraping* automatizado, desenvolvido para lidar com diversas fontes de forma autônoma e segura.

- **Processo de Scraping Automatizado:** O sistema monitora ativamente as principais fontes de fomento, extraindo dados de plataformas críticas como Prosas, IPEA, entre outras.
- **Extração de Anexos (PDFs):** O pipeline possui a capacidade nativa de realizar o download seguro de arquivos PDF anexados aos editais e realizar a extração do texto contido neles, trazendo o conteúdo para o motor do sistema.
- **Escudo de Deduplicação (Deduplication Shield):** Para evitar retrabalho e injeções repetidas no sistema, utilizamos um mecanismo de *URL hashing* que assegura que cada oportunidade seja única, otimizando os custos e a consistência do banco de dados.

---

# 4. Extração com Inteligência Artificial

A inteligência da plataforma reside na capacidade de transformar textos longos e confusos em informações precisas e acionáveis, utilizando **Vertex AI (Gemini)**.

- **Estruturação de Dados Brutos:** O motor de IA lê o texto não estruturado (processando trechos de até 15.000 caracteres) proveniente dos editais ou PDFs e os converte em dados estruturados e estritamente validados.
- **Classificação Validadas:** Através desta leitura, a IA identifica com precisão os orçamentos (budgets), prazos (deadlines), alcance geográfico (geographic reach) e os critérios de elegibilidade.
- **Medidas de Segurança (Safety Measures):** Sabendo dos limites das APIs da IA, o sistema conta com um tratamento gracioso de erros de limite de cota (429 Quota errors), capturando-os e os silenciando estrategicamente (handling silently) para garantir que o pipeline de ingestão continue rodando sem falhas globais.

---

# 5. O Motor de Matchmaker (Caçador de OSCs)

Assim que as informações do Edital estão extraídas e estruturadas, o **Matchmaker** entra em ação para conectar as pontas.

O sistema é responsável por avaliar de forma automatizada o perfil cadastrado da OSC (sua localização, CNAEs, histórico e capacidade) contra os requisitos estruturados do Edital. Através dessa avaliação cruzada, o sistema gera:
- Um **Match Score**: Uma pontuação que indica o nível de compatibilidade entre o projeto e a oportunidade.
- Um **Rationale da IA**: Uma justificativa inteligente sobre o porquê aquela OSC é aderente aos critérios do edital, facilitando o entendimento de onde estão as fortalezas e as potenciais lacunas de documentação.

---

# 6. Interface e Gestão (Dashboards)

Os resultados gerados pela plataforma são expostos em ferramentas voltadas ao usuário, criadas para maximizar a produtividade e a tomada de decisão.

- **Diretório de Editais:** Uma visão consolidada de todas as oportunidades estruturadas no sistema. Esta área destaca visualmente e de forma automática os itens recém-atualizados, permitindo que os gestores sempre foquem nas novidades mais quentes.
- **Dashboard de Matches V2:** A interface dedicada ao fluxo de trabalho de aprovação. Baseada nas pontuações do Matchmaker, ela fornece um fluxo (workflow) claro de "aprovações/rejeições" (approvals/rejections), permitindo que os consultores ou gestores das OSCs decidam com facilidade quais editais seguirão para a etapa de captação, organizando a esteira de projetos com agilidade.