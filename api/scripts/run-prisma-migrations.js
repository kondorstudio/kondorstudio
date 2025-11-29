// api/scripts/run-prisma-migrations.js
// Script seguro para validar schema.prisma, gerar client Prisma e aplicar migrations.
// Modo de uso (local):
//   node api/scripts/run-prisma-migrations.js
//
// O script faz:
// 1) Verifica se DATABASE_URL está definida (avisa e pede confirmação via env se não estiver).
// 2) Executa api/scripts/validate-prisma-schema.js (validação leve que você já criou).
// 3) Executa `npx prisma generate`.
// 4) Executa `npx prisma migrate dev --name "auto-migrate-<timestamp>"`.
// 5) Imprime instruções de rollback / próximos passos.
//
// Observação: execute localmente no terminal do PyCharm, não no container remoto sem revisar ENV.

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const validateScript = path.join(root, 'scripts', 'validate-prisma-schema.js');
const prismaBinary = 'npx';
const prismaArgsGenerate = ['prisma', 'generate'];
const prismaArgsMigrate = ['prisma', 'migrate', 'dev'];
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const migrateName = `auto-migrate-${timestamp}`;
const safeMigrateArgs = prismaArgsMigrate.concat(['--name', migrateName]);

function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, Object.assign({ stdio: 'inherit', shell: false }, opts));
    child.on('error', (err) => {
      reject(err);
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function fileExists(p) {
  try {
    await fs.promises.access(p, fs.constants.R_OK);
    return true;
  } catch (e) {
    return false;
  }
}

(async () => {
  try {
    console.log('>>> Rodando validação do schema Prisma...');
    if (!(await fileExists(validateScript))) {
      console.error(`Arquivo de validação não encontrado: ${validateScript}`);
      console.error('Crie api/scripts/validate-prisma-schema.js antes de rodar este script.');
      process.exit(1);
    }

    // 0) checar DATABASE_URL — se ausente, imprimir aviso e pedir confirmação via env (não interativo)
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.warn('AVISO: DATABASE_URL não está definida no ambiente.');
      console.warn('Se você executar migrations sem DATABASE_URL, a operação pode falhar ou criar DB local dependendo do seu prisma schema.');
      console.warn('Defina DATABASE_URL (ex: export DATABASE_URL="postgresql://user:pass@host:5432/dbname") antes de rodar o script.');
      // ainda assim vamos permitir rodar, mas apenas se o arquivo .env existir
      const envPath = path.join(root, '..', '.env');
      if (await fileExists(envPath)) {
        console.log(`.env encontrado em ${envPath} — carregue as variáveis em seu terminal (ex: source .env) se desejar continuar.`);
      } else {
        console.warn('.env não encontrado — abortando para evitar correr migrações sem DB.');
        process.exit(1);
      }
    }

    // 1) Rodar validação
    await runCommand('node', [validateScript], { cwd: root });
    console.log('Validação do schema concluída com sucesso.');

    // 2) Prisma generate
    console.log('\n>>> Executando: npx prisma generate');
    await runCommand(prismaBinary, prismaArgsGenerate, { cwd: root });
    console.log('Prisma client gerado com sucesso.');

    // 3) Prisma migrate dev (seguro)
    console.log(`\n>>> Executando: npx prisma migrate dev --name ${migrateName}`);
    console.log('Se houver prompts interativos (ex: "Are you sure?"), responda conforme seu ambiente local.');
    await runCommand(prismaBinary, safeMigrateArgs, { cwd: root });
    console.log('Migrations aplicadas com sucesso.');

    console.log('\n>>> Tudo OK. Próximos passos sugeridos:');
    console.log('- Verifique o banco e dados seed (se necessário).');
    console.log('- Rode os testes / start do backend (ex: npm run dev).');
    console.log('- Se for ambiente de CI/CD, gere backups antes de rodar migrate em produção.');
    process.exit(0);
  } catch (err) {
    console.error('\nERRO durante o processo de migrations:', err && err.message ? err.message : err);
    console.error('Stack:', err && err.stack ? err.stack : '(no stack)');
    console.error('\nDica: reveja o schema.prisma, DATABASE_URL e logs acima para identificar falhas.');
    process.exit(1);
  }
})();
