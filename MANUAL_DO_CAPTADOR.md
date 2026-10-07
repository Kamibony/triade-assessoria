# Manual do Captador: Maximizando Resultados para sua Carteira de OSCs

Bem-vindo ao Manual do Captador! Este guia foi desenvolvido especialmente para consultores e agências de captação de recursos (B2B2B) que utilizam nossa plataforma para gerenciar o portfólio de múltiplas Organizações da Sociedade Civil (OSCs).

Nossa plataforma atua como um assistente inteligente, automatizando a busca diária por editais e garantindo que você foque no que realmente importa: a construção de propostas vencedoras e o relacionamento com os financiadores.

---

## 1. Visão Geral para Captadores

O principal desafio na captação de recursos para múltiplas OSCs é o volume e a pulverização das informações. Monitorar dezenas de fontes, ler diários oficiais e manuais de centenas de páginas em busca do edital perfeito para o perfil exato de *cada* um dos seus clientes é uma tarefa árdua e suscetível a erros humanos.

Nossa plataforma soluciona este gargalo operando um "Radar" contínuo. A Inteligência Artificial analisa milhares de editais ativos, cruzando as exigências de cada um (CNPJ, tempo de fundação, causa, região, etc.) com o perfil específico de cada OSC da sua carteira.

**O Valor para o Captador:**
- **Economia de Tempo:** Substitui horas de leitura manual de editais por uma curadoria automática diária.
- **Precisão:** A IA entende restrições complexas (ex: "apenas para OSCs com mais de 3 anos focadas na primeira infância") e só recomenda o que tem aderência.
- **Escala:** Permite gerenciar um número maior de clientes com a mesma equipe, mantendo a qualidade da prospecção.

---

## 2. Gestão de Portfólio (Alternando entre OSCs)

O núcleo da experiência para o Captador na plataforma é a capacidade de alternar o "contexto ativo". O sistema foi projetado com uma arquitetura de **Contexto de OSC Ativa** (`ActiveOscContext`), o que significa que toda a interface se adapta para mostrar exclusivamente os dados, históricos e oportunidades do cliente selecionado no momento.

### Como alternar entre seus clientes:
1. Ao acessar a plataforma, utilize o menu de seleção no topo da tela para escolher qual OSC da sua carteira você deseja gerenciar naquele momento.
2. Ao selecionar uma organização (ex: "Instituto Ação Jovem"), o sistema carrega o "Id da OSC Ativa".
3. A partir deste momento, todas as ferramentas — desde a tela de descobertas até o histórico de editais — irão refletir **apenas** as informações deste cliente.
4. Para visualizar as oportunidades de outro cliente, basta abrir o menu novamente e selecionar a nova OSC.

Se nenhuma OSC estiver selecionada, o sistema solicitará que você escolha uma organização para visualizar as descobertas (`"Selecione uma OSC para visualizar as descobertas"`).

---

## 3. Caçador Diário e Análise de Oportunidades

Uma vez selecionado o cliente, você tem acesso a duas ferramentas principais para descobrir financiamentos: o **Caçador Diário** (`CacadorClientView`) e a aba de **Descobertas** (`PortalDiscover`).

### A Aba de Descobertas (PortalDiscover)
Esta é a ferramenta de curadoria sob demanda.
- **Análise Direcionada:** Ao clicar em "Analisar Oportunidades Agora", a IA mapeia editais ativos e lê o perfil da sua OSC selecionada.
- **Advogado do Diabo:** Durante o processo, a IA aplica uma análise semântica de restrições, filtrando o que não se encaixa.
- **Resultados:** Você visualizará "Cards" com as oportunidades que possuem alto nível de alinhamento. Editais que já foram rejeitados por você no passado não aparecerão novamente.

### O Caçador Diário (CacadorClientView)
Esta tela funciona como uma "linha do tempo" das oportunidades encontradas para o cliente ativo.
- **Visão por Data:** As oportunidades são agrupadas por dia, permitindo que você veja exatamente o que a IA encontrou "Hoje", "Ontem", etc.
- **Filtro de Qualidade:** O sistema oculta automaticamente editais com baixa aderência ou que sofreram "rejeição direta", focando apenas naquilo que realmente tem chance de sucesso.
- **Informações Rápidas:** Em cada oportunidade, você verá imediatamente o nome do edital, a instituição emissora, as tags principais, o valor do financiamento (ex: R$ 500.000) e o prazo para submissão (ou indicação de "Fluxo Contínuo").

---

## 4. Maximizando a Captação com IA

O maior diferencial para o dia a dia do Captador está na análise qualitativa entregue pela IA, visível nas telas de descoberta e no detalhamento dos editais.

### O Match Score
Para cada edital recomendado, a IA calcula um **Match Score** (ex: 85%).
- Este número não é aleatório; ele representa o grau de compatibilidade técnica entre as regras do edital e o estatuto/histórico da OSC ativa.
- **Dica de Uso:** Utilize a coloração do score para priorizar seu trabalho. Concentre-se primeiro nos matches de cor Verde (acima de 75%), que indicam altíssima chance de aprovação dos requisitos, seguidos pelos de cor Laranja (acima de 50%).

### O Racional da IA ("Por que escolhemos isso")
Abaixo de cada oportunidade, há um bloco chamado **"Por que escolhemos isso"** (`aiRationale`).
- A IA gera uma justificativa em texto explicando exatamente *o motivo* daquela OSC ser elegível para aquele edital.
- **Drafting (Escrita de Propostas):** Esta é a ferramenta mais poderosa para o Captador. Use os argumentos gerados no "Racional" como base para a redação da sua proposta técnica (Grant Proposal). A IA já extraiu os pontos fortes da OSC que se alinham com os objetivos do financiador, poupando horas de estruturação de argumentos.

### Tomando Decisões
Dentro da aba de Descobertas, ao clicar em "Ver Detalhes e Justificativa", você pode visualizar análises profundas. Se notar que o sistema indica um "Pendente de Informação" em laranja, significa que o edital exige algo (como uma certidão específica) que não consta no perfil da OSC. Esta é a deixa para o consultor solicitar este documento ao cliente antes de investir tempo na escrita do projeto.

---
*Este manual reflete as funcionalidades atuais do sistema B2B2B. Utilize o contexto de OSCs com inteligência para maximizar a captação de toda a sua carteira!*