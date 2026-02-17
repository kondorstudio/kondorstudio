process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const apiRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(apiRoot, 'prisma', 'schema.prisma');
const migrationPath = path.join(
  apiRoot,
  'prisma',
  'migrations',
  '20260214120000_brand_ga4_settings',
  'migration.sql',
);

function walkFiles(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        if (entry.name === '.git') continue;
        stack.push(fullPath);
        continue;
      }
      out.push(fullPath);
    }
  }
  return out;
}

test('BrandGa4Settings model is defined in Prisma schema with stable keys/indexes', () => {
  const schema = fs.readFileSync(schemaPath, 'utf8');

  assert.match(schema, /model\s+BrandGa4Settings\s*{/);
  assert.match(schema, /@@map\("brand_ga4_settings"\)/);

  const hasUniqueBrand = /brandId\s+String\s+@unique/.test(schema);
  const hasTenantBrandUnique = /@@unique\(\[\s*tenantId\s*,\s*brandId\s*\]\)/.test(schema);
  assert.ok(
    hasUniqueBrand || hasTenantBrandUnique,
    'BrandGa4Settings must have unique key for tenant/brand mapping',
  );

  assert.match(schema, /@@index\(\[\s*tenantId\s*,\s*brandId\s*\]\)/);
  assert.match(schema, /@@index\(\[\s*tenantId\s*,\s*propertyId\s*\]\)/);
});

test('brand_ga4_settings migration exists and creates table + keys/indexes', () => {
  assert.ok(fs.existsSync(migrationPath), 'brand_ga4_settings migration file is missing');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS "brand_ga4_settings"/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "brand_ga4_settings_brandId_key"/);
  assert.match(
    sql,
    /CREATE INDEX IF NOT EXISTS "brand_ga4_settings_tenant(?:Id)?_?(?:brand|property|idx)/,
  );
});

test('no source code path relies on $executeRawUnsafe for brand_ga4_settings bootstrap', () => {
  const roots = ['src', 'scripts', 'test']
    .map((dir) => path.join(apiRoot, dir))
    .filter((fullPath) => fs.existsSync(fullPath));

  const offenders = [];
  for (const root of roots) {
    const files = walkFiles(root);
    for (const filePath of files) {
      if (!/\.(cjs|js|mjs|ts|tsx|sql)$/i.test(filePath)) continue;
      const raw = fs.readFileSync(filePath, 'utf8');
      const hasBrandSettingsRef = raw.includes('brand_ga4_settings');
      const hasUnsafeRaw = raw.includes('$executeRawUnsafe');
      if (filePath === __filename) continue;
      if (hasBrandSettingsRef && hasUnsafeRaw) {
        offenders.push(path.relative(apiRoot, filePath));
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Found unsafe brand_ga4_settings bootstrap references: ${offenders.join(', ')}`,
  );
});
