#!/usr/bin/env node
/**
 * validate-imports.js
 *
 * Script rápido para validar IMPORTS relativos entre "routes" e "services" (ou entre qualquer arquivo)
 * - Objetivo: apontar imports cujo arquivo alvo NÃO existe no filesystem (caminho incorreto)
 * - Uso: coloque este script na raiz do repo e rode `node ./scripts/validate-imports.js`
 *
 * Comportamento:
 * 1) Procura por arquivos .js/.ts dentro das pastas comuns:
 *    - api/routes, routes, src/routes, server (rotas)
 *    - api/services, services, src/services (services)
 *    - e varredura geral (todos .js/.ts) para capturar imports
 * 2) Para cada import/require relativo (./ ../) valida se o arquivo alvo existe
 *    - tenta resolver com extensões: .js, .ts, .jsx, .tsx, /index.js, /index.ts
 * 3) Produz um relatório legível com:
 *    - arquivos verificados
 *    - imports quebrados (caminho, arquivo origem, linha)
 *    - resumo com contagem
 *
 * Limitações:
 * - Imports com aliases (ex: @/services/foo) dependem de resolução custom (webpack/tsconfig). O script tentará resolver aliases básicos se você configurar ALIASES no topo.
 * - Não valida nomes de export (se a função exportada realmente existe) — só valida existência do caminho de arquivo.
 *
 * Recomendações após rodar:
 * - Corrija paths relativos incorretos (normalmente ../../folder vs ../folder)
 * - Se usar aliases (ex: @/services) e o script acusar erro, adicione a entrada em `ALIASES` abaixo apontando para o caminho real relativo à raiz.
 *
 * Saída:
 * - ./scripts/validate-imports.report.txt (relatório completo)
 *
 * Desenvolvido para o fluxo KONDOR STUDIO: 1 arquivo por vez, revisão local.
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd(); // execute a partir da raiz do repositorio
const OUTFILE = path.join(ROOT, 'scripts', 'validate-imports.report.txt');

// Se você usa aliases (tsconfig paths / webpack), adicione aqui conforme necessário:
// chave: prefixo do import, valor: caminho relativo ao ROOT
const ALIASES = {
  // ex: '@': 'src',
  // ex: '@services/': 'api/services/'
};

// extensões para tentar resolver
const EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'];

/** procura todos arquivos .js/.ts no repo (pula node_modules e .git) */
function findSourceFiles(root) {
  const out = [];
  const skip = new Set(['node_modules', '.git', 'dist', 'build', '.next']);
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (skip.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else {
        if (/\.(js|ts|jsx|tsx|mjs|cjs)$/.test(e.name)) out.push(full);
      }
    }
  }
  walk(root);
  return out;
}

/** extrai imports/require de um arquivo (método simples via regex) */
function extractImports(fileContent) {
  const imports = [];
  const lines = fileContent.split(/\r?\n/);
  const importRegex = /^\s*import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/;
  const dynamicImportRegex = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  const requireRegex = /require\(\s*['"]([^'"]+)['"]\s*\)/;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('*/')
    ) {
      return;
    }

    let m = line.match(importRegex);
    if (m) imports.push({ raw: m[1], line: idx + 1 });
    // require
    m = line.match(requireRegex);
    if (m) imports.push({ raw: m[1], line: idx + 1 });
    // dynamic imports (global)
    let dm;
    while ((dm = dynamicImportRegex.exec(line)) !== null) {
      imports.push({ raw: dm[1], line: idx + 1 });
    }
  });
  return imports;
}

/** tenta resolver um caminho relativo/aliased para um arquivo existente */
function resolveImport(fromFile, importPath) {
  // ignore core modules or absolute npm packages
  if (!importPath) return { ok: true, resolved: importPath, reason: 'empty' };
  if (!importPath.startsWith('.') && !Object.keys(ALIASES).some(a => importPath.startsWith(a))) {
    // pacote npm ou não relativo -> consider we won't validate it
    return { ok: true, resolved: importPath, reason: 'npm-or-external' };
  }

  // alias handling
  for (const prefix of Object.keys(ALIASES)) {
    if (importPath.startsWith(prefix)) {
      const targetRel = ALIASES[prefix] + importPath.slice(prefix.length);
      const candidate = path.join(ROOT, targetRel);
      const resolved = tryResolveFile(candidate);
      return { ok: !!resolved, resolved, reason: 'alias' };
    }
  }

  // relative path
  const baseDir = path.dirname(fromFile);
  const candidateBase = path.resolve(baseDir, importPath);
  const resolved = tryResolveFile(candidateBase);
  return { ok: !!resolved, resolved, reason: 'relative' };
}

/** tenta diversas variações do caminho (arquivo, .index etc) */
function tryResolveFile(candidateBase) {
  // if candidateBase already has extension and exists
  try {
    if (fs.existsSync(candidateBase) && fs.statSync(candidateBase).isFile()) return candidateBase;
  } catch (e) {}
  // try with extensions
  for (const ext of EXTENSIONS) {
    const p = candidateBase + ext;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  // try index files in candidateBase as dir
  if (fs.existsSync(candidateBase) && fs.statSync(candidateBase).isDirectory()) {
    for (const ext of EXTENSIONS) {
      const p = path.join(candidateBase, 'index' + ext);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    }
  }
  // not found
  return null;
}

/** main */
function main() {
  console.log('Iniciando validação de imports — rodar a partir da raiz do repo.');
  const allFiles = findSourceFiles(ROOT);
  // heurística: prioriza rotas & services, mas verifica todos
  const routeCandidates = allFiles.filter(f => /routes|route|controllers|router/i.test(f));
  const serviceCandidates = allFiles.filter(f => /services|service/i.test(f));
  const filesToScan = Array.from(new Set([...routeCandidates, ...serviceCandidates, ...allFiles])); // order: prioritized

  const broken = [];
  const summary = { scanned: 0, importsFound: 0, brokenCount: 0 };
  const details = [];

  for (const file of filesToScan) {
    summary.scanned++;
    let content = '';
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (e) {
      // skip unreadable
      continue;
    }
    const imports = extractImports(content);
    if (imports.length === 0) continue;
    for (const imp of imports) {
      summary.importsFound++;
      const result = resolveImport(file, imp.raw);
      if (!result.ok) {
        summary.brokenCount++;
        const rec = {
          file,
          line: imp.line,
          importPath: imp.raw,
          resolved: result.resolved,
          reason: result.reason,
        };
        broken.push(rec);
        details.push(rec);
      }
    }
  }

  // write report
  const lines = [];
  lines.push('VALIDATE-IMPORTS REPORT');
  lines.push(`Repo root: ${ROOT}`);
  lines.push('');
  lines.push(`Files scanned: ${summary.scanned}`);
  lines.push(`Imports found: ${summary.importsFound}`);
  lines.push(`Broken imports: ${summary.brokenCount}`);
  lines.push('');
  if (details.length) {
    lines.push('--- BROKEN IMPORTS (detalhes) ---');
    details.forEach(d => {
      lines.push(`Arquivo: ${path.relative(ROOT, d.file)} (linha ${d.line})`);
      lines.push(`  import: "${d.importPath}"`);
      lines.push(`  tentativa de resolver: ${d.resolved || 'NÃO ENCONTRADO'}`);
      lines.push(`  motivo: ${d.reason}`);
      lines.push('');
    });
  } else {
    lines.push('Nenhum import relativo quebrado detectado (check básico).');
  }

  lines.push('');
  lines.push('Sugestões:');
  lines.push('- Se apareceram imports com alias (ex: "@/services/foo"), adicione o alias em ALIASES no topo do script apontando para o caminho real.');
  lines.push('- Corrija os caminhos relativos nos arquivos indicados (ajuste ../ vs ../../).');
  lines.push('- Para checagens de exports nomeados (se a função exportada existe), use ferramentas estáticas (TypeScript tsc ou ESLint com parser adequado).');
  lines.push('');
  lines.push('Comportamento do script: valida existência de arquivo apontado pelo import. NÃO altera arquivos.');
  lines.push('');
  const out = lines.join('\n');
  try {
    fs.mkdirSync(path.dirname(OUTFILE), { recursive: true });
    fs.writeFileSync(OUTFILE, out, 'utf8');
    console.log('Relatório gerado em:', OUTFILE);
    console.log('Resumo:', summary);
    if (summary.brokenCount > 0) {
      console.log('Broken imports encontrados. Abra o arquivo de relatório para detalhes.');
      process.exitCode = 2;
    } else {
      console.log('Nenhum import relativo quebrado detectado (check básico).');
      process.exitCode = 0;
    }
  } catch (e) {
    console.error('Erro escrevendo relatório:', e);
    process.exitCode = 1;
  }
}

main();
