// api/scripts/validate-prisma-schema.js
// Script de validação leve do schema.prisma antes de rodar prisma generate/migrate.
// Roda localmente: node api/scripts/validate-prisma-schema.js
// Saída:
//  - exit code 0 => OK
//  - exit code 1 => problemas encontrados (detalhados no stdout)

const fs = require('fs');
const path = require('path');

const schemaPath = path.resolve(__dirname, '..', 'prisma', 'schema.prisma');

function fail(msg) {
  console.error('✖', msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log('✔', msg);
}

if (!fs.existsSync(schemaPath)) {
  fail(`schema.prisma não encontrado em: ${schemaPath}`);
  console.error('Caminho atual:', process.cwd());
  process.exit(1);
}

const schema = fs.readFileSync(schemaPath, 'utf8');

console.log('Validando schema.prisma em:', schemaPath);
let errors = 0;

// helper simples para buscar model e campo
function hasModel(name) {
  const re = new RegExp(`model\\s+${name}\\s+\\{`, 'i');
  return re.test(schema);
}
function hasModelField(modelName, fieldName) {
  const start = schema.search(new RegExp(`model\\s+${modelName}\\s+\\{`, 'i'));
  if (start === -1) return false;
  // pega até fechamento do model (rough)
  const sub = schema.slice(start);
  const end = sub.indexOf('\n}\n');
  const body = end === -1 ? sub : sub.slice(0, end);
  const re = new RegExp(`\\b${fieldName}\\b`, 'i');
  return re.test(body);
}
function hasEnum(name) {
  const re = new RegExp(`enum\\s+${name}\\s+\\{`, 'i');
  return re.test(schema);
}

const requiredModels = ['Plan', 'Subscription', 'Invoice', 'Payment'];
requiredModels.forEach(m => {
  if (hasModel(m)) {
    ok(`Model encontrada: ${m}`);
  } else if (hasEnum(m)) {
    // Payment pode ser enum (PaymentStatus), consideramos presença também
    ok(`Encontrado enum com nome ${m} (aceito)`);
  } else {
    fail(`Model/Enum ausente: ${m}`);
    errors++;
  }
});

// checar especificamente Subscription.status e currentPeriodEnd
if (!hasModel('Subscription')) {
  fail('Model Subscription ausente — necessário para billing.');
  errors++;
} else {
  if (hasModelField('Subscription', 'status')) {
    ok('Subscription.status — presente');
  } else {
    fail('Campo ausente: Subscription.status');
    errors++;
  }
  if (hasModelField('Subscription', 'currentPeriodEnd')) {
    ok('Subscription.currentPeriodEnd — presente');
  } else {
    fail('Campo ausente: Subscription.currentPeriodEnd');
    errors++;
  }
}

// checar Plan.priceCents (ou price) — aceitamos priceCents preferencialmente
if (hasModelField('Plan', 'priceCents')) {
  ok('Plan.priceCents — presente (ok)');
} else if (hasModelField('Plan', 'price')) {
  ok('Plan.price — presente (usar com atenção, ideal usar priceCents)');
} else {
  fail('Campo de preço ausente no Plan (esperado priceCents ou price)');
  errors++;
}

// checar enum PaymentStatus (ou PaymentStatus)
if (hasEnum('PaymentStatus') || hasEnum('Payment')) {
  ok('Enum PaymentStatus/Payment presente');
} else {
  fail('Enum PaymentStatus (ou Payment) ausente — verifique statuses de pagamento');
  errors++;
}

console.log('---');
if (errors === 0) {
  console.log('Validação concluída: OK. Pode rodar `npm run prisma:generate` e `npm run prisma:migrate` com mais confiança.');
  process.exit(0);
} else {
  console.error(`Validação encontrou ${errors} problema(s). Corrija antes de migrar.`);
  process.exit(1);
}
