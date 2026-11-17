# Integração Balby Team com Cloudflare D1

O Worker serve a API em /api/balby e encaminha as demais páginas ao binding ASSETS.
O destino foi identificado nas capturas do painel como soft-math-928a, ligado a nfsfdigital.com.

## Ativação

Execute os comandos na raiz do repositório. O Database ID e o nome devem corresponder ao banco D1 já criado.

1. Execute "node balby-d1/configurar.mjs UUID nome-do-banco". Isso acrescenta o binding BALBY_DB e configura o Worker com código.
2. Consulte o esquema existente com "npx wrangler d1 execute nome-do-banco --remote --command=\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;\"".
3. Aplique as migrações com "npx wrangler d1 migrations apply nome-do-banco --remote". As tabelas desta integração têm prefixo bt_.
4. Configure uma chave aleatória em "npx wrangler secret put BALBY_SETUP_TOKEN".
5. Publique com "npx wrangler deploy".
6. Faça um POST em https://nfsfdigital.com/api/balby/setup com Origin https://nfsfdigital.com, Authorization Bearer seguido da chave configurada e JSON com email, name e password do AD1. Use senha com 10 a 128 caracteres.
7. Após o cadastro do AD1, remova a chave com "npx wrangler secret delete BALBY_SETUP_TOKEN". O banco também impede um segundo cadastro inicial.
8. Entre no app pelo e-mail configurado, crie um convite e valide o cadastro em outro aparelho.

O upload de pasta de arquivos estáticos usado anteriormente publica o HTML. A integração com D1 exige publicar também o código do Worker e seu binding.

## Dados e arquivos

Contas, sessões, vínculos de professores, fichas, check-ins, protocolos, convites, mensagens, acordos e auditoria ficam no D1.
Os anexos de até 10 MB são armazenados no D1 em partes de 256 KiB e baixados por uma rota que verifica a sessão e as permissões.
O upload e seus metadados são gravados na mesma transação.
Versões de registros impedem que uma edição sobrescreva alterações de outro aparelho.
Cada envio de arquivo possui um identificador para suportar uma tentativa repetida após falha de conexão.
A baixa financeira exige confirmação de recebimento e senha do AD1. O sistema registra a baixa manual informada pelo gestor.
As configurações de juros e carência são guardadas para gestão. O cálculo automático de parcelas está fora desta integração.
O encerramento de acesso usa desativação, preservando o histórico.

As contas e os arquivos da demonstração local continuam no armazenamento do navegador antigo.
Esta versão utiliza contas cadastradas no servidor. Dados locais de demonstração não são importados automaticamente.

## Verificação executada

O Worker foi exercitado com SQLite local e a mesma interface de consultas do D1.
Foram validados convites únicos, login e sessão em outro contexto, permissões de aluno e professor vinculado,
conflitos de versão, arquivo privado, reenvio idempotente, baixa com reautenticação e invalidação de sessões ao desativar a conta.
O teste no Chrome usou dois contextos independentes e verificou cadastro, anamnese, exame no AD1 e resposta no aluno.

A validação no D1 remoto depende de informar o banco real, aplicar as migrações e publicar o Worker.
