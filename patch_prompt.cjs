const fs = require('fs');
const file = './functions/src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const oldPromptBlock = `Regras estritas (GUARDRAILS):
1. Se uma restrição (ex: "Apenas para ONGs do estado de SP") NÃO estiver explicitamente escrita no texto do edital, você DEVE gerar o status "Não Encontrado" para esse critério e "Não Encontrado" para a citação.
2. NUNCA invente ou infira citações. A citação DEVE ser uma cópia exata ou um resumo muito fiel de um trecho REAL do texto fornecido.
3. Se a ONG não cumprir um critério explícito, o status é "Reprovado". Se cumprir, é "Aprovado".
4. Se o edital exigir um critério (ex: comprovar atuação numa área), mas o perfil da ONG não fornecer informações suficientes para você ter certeza absoluta (ex: a Atividade Principal ou Missão estão vazias, ou data de fundação é 'Data Desconhecida'), VOCÊ NÃO PODE REPROVAR. O status para este critério DEVE SER OBRIGATORIAMENTE 'Pendente de Informação'. Só gere 'Reprovado' se a informação da ONG for explicitamente e inquestionavelmente contrária a um critério rígido do edital. Em caso de incerteza ou margem para interpretação, incline-se para 'Pendente de Informação'.

Avalie os seguintes critérios mínimos OBRIGATORIAMENTE, dividindo as regras do edital em pelo menos 4 a 5 itens distintos (e avaliando CADA UM individualmente):
- Geografia (A ONG está na região permitida?)
- Prazo (O edital ainda está aberto considerando a data atual?)
- Tempo de Fundação (A ONG tem a idade mínima exigida?)
- Documentação/Certificações (A ONG possui o que é exigido?)
- Requisitos Temáticos (A ONG atua nas áreas exigidas pelo edital?)

ATENÇÃO: Extraia e avalie cada critério acima separadamente. NUNCA agrupe tudo em um único item como "Elegibilidade Burocrática".
Se o perfil da ONG não tiver dados sobre um critério distinto específico (ex: não diz se tem os certificados, ou a data de fundação é desconhecida), você DEVE marcar ESSE critério específico como 'Pendente de Informação'. NUNCA use 'Reprovado' por falta de informação.

Responda APENAS com o JSON no formato definido. Não adicione explicações extras.\`;`;

const newPromptBlock = `Regras estritas (GUARDRAILS):
1. AVALIE EXATAMENTE OS 4 CRITÉRIOS A SEGUIR. O array DEVE ter tamanho 4.
- Localização (A ONG está na região permitida?)
- Prazo (O edital ainda está aberto considerando a data atual?)
- Fundação (A ONG tem a idade mínima exigida?)
- Documentação (A ONG possui os documentos/certificações exigidos?)

2. STATUS DISPONÍVEIS: 'Aprovado', 'Reprovado', 'Pendente de Informação'.
NUNCA USE 'Não Encontrado'. NUNCA USE QUALQUER OUTRA STRING.

3. REGRAS DE STATUS:
- Se a ONG cumprir um critério explicitamente, o status é "Aprovado".
- Se a ONG não cumprir um critério explícito (ex: edital exige SP, ONG está no RJ), o status é "Reprovado".
- Se uma restrição (ex: "Apenas SP") NÃO estiver escrita no texto do edital, marque "Aprovado" ou "Pendente de Informação" dependendo do contexto, mas NUNCA "Não Encontrado". Para "Prazo", se não houver data, avalie como "Aprovado" (fluxo contínuo).
- Se o perfil da ONG não fornecer informações suficientes (ex: não diz se tem os certificados, ou data de fundação desconhecida), você DEVE marcar "Pendente de Informação". NUNCA use "Reprovado" por falta de informação. Em caso de incerteza, use "Pendente de Informação".

4. CITAÇÕES: NUNCA invente citações. Use cópia exata ou resumo fiel. Se faltar info da ONG, escreva "Pendente de dados no perfil da ONG para cruzar com a exigência: [regra do edital]".

ATENÇÃO: AVALIE CADA UM DOS 4 CRITÉRIOS SEPARADAMENTE. NUNCA agrupe (ex: "Elegibilidade"). Retorne os exatos 4 objetos no array.
Responda APENAS com o JSON. Nenhuma explicação adicional.\`;`;

code = code.replace(oldPromptBlock, newPromptBlock);
fs.writeFileSync(file, code);
