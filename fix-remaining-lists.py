#!/usr/bin/env python3
"""
Script para arreglar la estructura de filterBranch en todas las listas.
Ejecutar: python fix-remaining-lists.py
"""

import re

# Leer archivo
with open('src/routes/lists.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Lista de IDs de listas a arreglar (las que faltan)
lists_to_fix = [
    'contacts-without-phone',
    'contacts-without-owner',
    'contacts-inactive-180',
    'contacts-created-90-no-activity',
    'contacts-high-risk',
    'deals-without-contact',
    'deals-without-amount',
    'deals-without-owner',
    'deals-inactive-180',
    'deals-stuck-stage',
    'deals-high-risk'
]

fixed_count = 0

for list_id in lists_to_fix:
    # Patrón para encontrar el bloque de la lista
    pattern = rf"('{list_id}':\s*\{{[^}}]*?filterBranch:\s*\{{)\s*filterBranchType:\s*'(OR|AND)',\s*filterBranchOperator:\s*'(OR|AND)',\s*filters:\s*\["
    
    # Función de reemplazo
    def replace_filter(match):
        nonlocal fixed_count
        fixed_count += 1
        prefix = match.group(1)
        return f"{prefix}\n            filterBranchType: 'OR',\n            filterBranchOperator: 'OR',\n            filterBranches: [\n              {{\n                filterBranchType: 'AND',\n                filterBranchOperator: 'AND',\n                filters: ["
    
    # Buscar y reemplazar
    content = re.sub(pattern, replace_filter, content, flags=re.DOTALL)
    
    # También necesitamos cerrar correctamente los filterBranches
    # Buscar el cierre de filters dentro de cada lista
    pattern_close = rf"('{list_id}':[^}}]*?filters:\s*\[[^\]]*?\])\s*\}}\s*\}},"
    
    def replace_close(match):
        prefix = match.group(1)
        return f"{prefix}\n                }}\n              ]\n            }}\n          }},"
    
    content = re.sub(pattern_close, replace_close, content, flags=re.DOTALL)

# Escribir archivo
with open('src/routes/lists.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"✓ Arregladas {fixed_count} listas")
print(f"✓ Archivo actualizado: src/routes/lists.js")

