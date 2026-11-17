import {readFileSync,writeFileSync} from 'node:fs';
const [databaseId,databaseName='balby-team'] = process.argv.slice(2);
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseId || '')) {
  throw new Error('Informe o Database ID real. Uso: node balby-d1/configurar.mjs UUID nome-do-banco');
}
if (!/^[a-zA-Z0-9_-]+$/.test(databaseName)) throw new Error('Nome de banco inválido.');
const config = JSON.parse(readFileSync('wrangler.jsonc','utf8'));
config.name = 'soft-math-928a';
config.main = './balby-d1/worker.mjs';
config.assets = {...config.assets,binding:'ASSETS',run_worker_first:['/api/balby','/api/balby/*']};
config.d1_databases = [...(config.d1_databases || []).filter(item=>item.binding !== 'BALBY_DB'),{
  binding:'BALBY_DB',database_name:databaseName,database_id:databaseId,migrations_dir:'balby-d1/migrations',migrations_table:'bt_d1_migrations'
}];
writeFileSync('wrangler.jsonc',JSON.stringify(config,null,2)+'\n');
console.log('Configurado Worker soft-math-928a e D1 ' + databaseName + '.');
