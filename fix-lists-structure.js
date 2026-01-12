// Script para arreglar estructura de filterBranch en todas las listas
// Ejecutar: node fix-lists-structure.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const listsFile = path.join(__dirname, 'src/routes/lists.js');
let content = fs.readFileSync(listsFile, 'utf-8');

// Función para convertir filters en filterBranches con AND
function wrapInAndBranch(filtersContent) {
  return `filterBranches: [
            {
              filterBranchType: 'AND',
              filterBranchOperator: 'AND',
              ${filtersContent}
            }
          ]`;
}

// Patrón regex para encontrar todos los filterBranch
const pattern = /filterBranch: \{\s*filterBranchType: 'OR',\s*filterBranchOperator: 'OR',\s*filters: \[/g;

// Contador de reemplazos
let count = 0;

// Reemplazar filters por filterBranches
content = content.replace(
  /filterBranch: \{\s*filterBranchType: '(OR|AND)',\s*filterBranchOperator: '(OR|AND)',\s*filters: \[/g,
  (match) => {
    count++;
    return match.replace('filters: [', 'filterBranches: [\n            {\n              filterBranchType: \'AND\',\n              filterBranchOperator: \'AND\',\n              filters: [');
  }
);

// Cerrar las ramas AND correctamente
// Buscar todos los ] que cierran filters y agregar cierre de AND branch
let inFilterBranch = 0;
let newContent = '';

for (let i = 0; i < content.length; i++) {
  newContent += content[i];
  
  // Detectar apertura de filterBranches
  if (content.substr(i, 14) === 'filterBranches') {
    inFilterBranch++;
  }
  
  // Detectar cierre de filters dentro de filterBranch
  if (inFilterBranch > 0 && content[i] === ']') {
    // Verificar si es el cierre de filters (no de operation)
    const ahead = content.substr(i, 50);
    if (ahead.includes('}\n        }') || ahead.includes('}\n          }')) {
      // Agregar cierre de AND branch
      if (!ahead.includes('}\n            }\n          ]')) {
        newContent += '\n            }\n          ';
        inFilterBranch--;
      }
    }
  }
}

console.log(`✓ Realizados ${count} reemplazos`);
console.log(`Contenido actualizado (${newContent.length} caracteres)`);

// Escribir archivo
fs.writeFileSync(listsFile, content);
console.log('✓ Archivo actualizado exitosamente');

