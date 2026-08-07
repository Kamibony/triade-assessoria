const { z } = require('zod');
console.log(z.object({ a: z.string() })._def.typeName);
