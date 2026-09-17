const fs = require('fs');
const file = './src/lib/types.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
/status: 'Aprovado' \| 'Reprovado' \| 'Pendente de Informação' \| 'Não Encontrado';/g,
"status: 'Aprovado' | 'Reprovado' | 'Pendente de Informação';"
);

code = code.replace(
/criterion: string;/g,
"criterion: 'Localização' | 'Prazo' | 'Fundação' | 'Documentação';"
);

fs.writeFileSync(file, code);
