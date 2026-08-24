const fs = require('fs');
let content = fs.readFileSync('src/components/ManualOscIngest.tsx', 'utf8');

content = content.replace(
    /import \{ functions \} from '\.\.\/lib\/firebase';/,
    `import { functions, storage } from '../lib/firebase';\nimport { ref, uploadBytes } from 'firebase/storage';`
);

content = content.replace(
    /const toBase64 =[\s\S]*?const handleSubmit = async \(\) => \{/,
    `const handleSubmit = async () => {`
);

content = content.replace(
    /const base64Files = await Promise\.all\(files\.map\(toBase64\)\);\s*const ingestManualOsc = httpsCallable\(functions, 'ingestManualOscFunction'\);\s*const response = await ingestManualOsc\(\{ pdfBase64s: base64Files \}\);/,
    `const timestamp = Date.now();
      const storagePaths: string[] = [];

      // 1. Upload files to Firebase Storage
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const path = \`temp_osc_docs/\${timestamp}/\${file.name}\`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        storagePaths.push(path);
      }

      // 2. Call backend function with storage paths
      const ingestManualOsc = httpsCallable(functions, 'ingestManualOscFunction');
      const response = await ingestManualOsc({ storagePaths });`
);

fs.writeFileSync('src/components/ManualOscIngest.tsx', content, 'utf8');
