# Portfolio Backend

API Node.js com Express, Prisma 6 e MySQL.

Antes de usar o app de gestão, execute `npm run admin:setup` nesta pasta para criar a conta administrativa. As alterações e uploads exigem login; as consultas do portfólio continuam públicas. Consulte [SEGURANCA.md](SEGURANCA.md) para sessão, cotas, formatos aceitos e implantação.

## Organização

```text
src/
  server.js                 Inicialização HTTP e encerramento das conexões
  app.js                    Montagem do Express e registro das rotas
  config/                   Variáveis de ambiente e URL do banco
  integrations/             Clientes Prisma e Cloudinary
  middlewares/              Erros HTTP gerais
  security/                 Sessões, cotas, validação de dados e inspeção de mídia
  modules/
    users/                  Rotas e serviço de usuários
    technologies/           Rotas e serviço de tecnologias
    projects/               Rotas e serviço de projetos e mídias
prisma/                     Schema do banco
```

Os arquivos `*.routes.js` cuidam de campos recebidos, validação e respostas HTTP. Os arquivos `*.service.js` executam os fluxos de banco e upload. As integrações são fornecidas por `server.js`, permitindo testar a aplicação sem acessar o MySQL ou enviar arquivos reais ao Cloudinary. Para adicionar funcionalidades, crie a operação no serviço e conecte-a à rota do módulo correspondente.

O proprietário do portfólio continua sendo o usuário `1`, definido em `users.service.js`. As rotas de usuários, tecnologias, projetos e mídias estão implementadas.

## Editar e excluir projetos e mídias

- `PATCH /projects/edit/:id`: recebe JSON com `nome`, `descricao` e/ou `tecnologias`. Campos omitidos são preservados; `descricao: null` limpa a descrição; `tecnologias: []` remove todos os vínculos. Um array informado substitui os vínculos anteriores, na mesma transação da edição. Retorna 200 com o projeto e os IDs das tecnologias.
- `DELETE /projects/delete/:id`: remove os registros de mídias, os vínculos com tecnologias e o projeto numa transação. As tecnologias são preservadas. Retorna 204.
- `POST /projects/:id/media/create`: recebe `multipart/form-data`, com um arquivo no campo `arquivo` (imagem ou vídeo de até 50 MB) e `ordem` opcional (inteiro não negativo, padrão 0). Envia ao Cloudinary e retorna 201 com o registro da mídia, incluindo `id`, `projeto_id`, `tipo`, `url` e `ordem`.
- `DELETE /projects/:id/media/delete/:mediaId`: exclui apenas a mídia pertencente ao projeto informado. Retorna 204 ou 404 quando não existe nesse projeto.

As exclusões removem registros do banco; os arquivos permanecem no Cloudinary. O ID da mídia é retornado tanto no upload quanto na consulta do projeto e pode ser usado para excluí-la.

## Consultar projetos

`GET /projects/get` retorna `id`, `nome` e `descricao` de cada projeto, em ordem de ID. Sem projetos, retorna `[]`.

`GET /projects/get/:id` retorna `{ "nome": "Portfolio", "tecnologias": [{ "nome": "Node", "imagem": "https://exemplo.com/node.png" }], "midias": [{ "id": 7, "url": "https://exemplo.com/projeto.png", "tipo": "imagem", "ordem": 0 }] }`. As mídias são ordenadas por `ordem` e depois por ID. Tecnologias e mídias ausentes retornam arrays vazios. ID inválido retorna 400; projeto inexistente retorna 404. O campo `midias` agora contém objetos, em vez de strings de URL.

## Criar projeto

Envie `POST /projects/create` com JSON: `{"nome":"Meu portfólio","descricao":"Site para apresentar meus projetos","tecnologias":[1,3,5]}`.

O nome é obrigatório (até 150 caracteres), a descrição é opcional e `tecnologias` deve ser um array de IDs numéricos existentes (pode ser vazio). IDs repetidos são unificados. O projeto e os vínculos em `projeto_tecnologias` são salvos na mesma transação. Retorna 201 com os campos do projeto e o array de IDs das tecnologias; dados inválidos ou tecnologias inexistentes retornam 400. As mídias serão adicionadas separadamente.

## Verificar alterações

Execute `npm test` para verificar autenticação, autorização, expiração, validação e uploads com integrações simuladas. Para checar a sintaxe dos arquivos no PowerShell, execute `Get-ChildItem src -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }`.

Após mudanças em `prisma/schema.prisma`, execute `npm run prisma:generate`. Se ocorrer `EPERM` na DLL do Prisma no Windows, pare o servidor antes de gerar o cliente. Mudanças no schema não alteram automaticamente as tabelas do banco.

Se o upload terminar e a gravação no banco falhar, o arquivo permanece no Cloudinary; limpeza compensatória ainda não está implementada.

## Enviar foto

Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` e `CLOUDINARY_API_SECRET` no `.env`.
Na aba Perfil do app de gestão, escolha a foto e salve as alterações. O app envia `multipart/form-data` com o campo `photo` para `POST /user/photo` (limite de 5 MB). A API devolve `{ "url": "https://..." }` depois de salvar a URL no cadastro.

O currículo não passa pelo Cloudinary: o app envia um PDF (até 5 MB, validado pelo conteúdo) no campo `resume` para `POST /user/resume`, e o servidor o grava em `data/uploads/curriculo.pdf` (altere a pasta com `UPLOADS_DIR`). `DELETE /user/resume` remove o arquivo. As rotas públicas `GET /user/resume` (abre no navegador) e `GET /user/resume/download` (anexo `Curriculo-<nome>.pdf`) entregam o PDF. Enquanto ele existir, `GET /user/get` devolve `curriculo: "/user/resume"`, um caminho relativo à API; sem arquivo, um link externo antigo em `curriculo` é usado como redirecionamento. O backend oferece apenas a API; não há página de teste na rota `/`.

## Executar

Requer Node.js 22.19 ou superior (recomendado: Node.js 24 LTS).

1. Execute `npm install`.
2. Configure o `.env` usando `.env.example`. As variáveis `DB_*` existentes continuam funcionando; `DATABASE_URL`, se definida, tem prioridade.
3. Execute `npm run prisma:generate`.
4. Execute `npm run dev` ou `npm start`.

O servidor usa a porta 3000. O banco e a tabela `user` devem existir; a aplicação não executa migrações automaticamente.

Os comandos `npm start` e `npm run dev` usam `--use-system-ca` para confiar também nas autoridades certificadoras instaladas no sistema, mantendo a validação HTTPS dos uploads. Reinicie o servidor após alterar esses comandos. Se iniciar diretamente, use `node --use-system-ca src/server.js`.

Se o upload ainda apresentar `unable to verify the first certificate`, confirme com o administrador da rede se a CA do proxy/antivírus está instalada como confiável. Caso receba um certificado CA em PEM, informe-o antes de iniciar o Node (PowerShell):

```powershell
$env:NODE_EXTRA_CA_CERTS = 'C:\certificados\ca-corporativa.pem'
npm run dev
```

`NODE_EXTRA_CA_CERTS` é lida na inicialização do Node; defini-la apenas no `.env` carregado pelo `dotenv` não é suficiente.

## Criar tecnologia

`GET /technologies/get` lista os registros da tabela `tecnologias` em ordem de ID, retornando 200 e um array (vazio quando não houver registros).

`PATCH /technologies/edit/:id` aceita `nome` e/ou arquivo `imagem` via `multipart/form-data`. Para alterar apenas o nome, também aceita JSON (`{"nome":"Node.js"}`). Campos omitidos são preservados. Uma imagem nova é enviada ao Cloudinary antes de atualizar a URL no banco. Retorna 200 com o registro atualizado, 400 para dados inválidos/edição vazia, 404 para ID inexistente e 409 para nome duplicado.

`DELETE /technologies/delete/:id` remove o registro do banco e retorna 204 sem corpo. ID inválido retorna 400, registro inexistente retorna 404 e vínculo impeditivo com outros registros retorna 409. A exclusão e a substituição de imagem não removem arquivos antigos do Cloudinary.

Envie `POST /technologies/create` como `multipart/form-data`, com `nome` (texto de até 100 caracteres) e `imagem` (arquivo de imagem de até 5 MB). A imagem é enviada à pasta `tecnologias` do Cloudinary; depois, o nome e a URL HTTPS são salvos na tabela `tecnologias`, nos campos `nome` e `imagem`.

A resposta de sucesso é 201 com o registro criado (`id`, `nome`, `imagem`). Dados inválidos retornam 400, nome já cadastrado retorna 409 e falhas de upload ou banco retornam 500. A tabela deve existir no banco; execute `npm run prisma:generate` após atualizar o schema.

## Usuários

`GET /user/get` retorna somente o proprietário de ID 1 e campos públicos selecionados, dentro de um array.

`PATCH /user/edit` recebe o ID e os campos a alterar no corpo JSON:

```json
{
  "id": 1,
  "nome": "Bruno",
  "email": "bruno@example.com",
  "idade": 30
}
```

Campos editáveis: `nome`, `email`, `idade`, `telefone`, `curriculo` e `descricao`. Campos omitidos são preservados. Campos opcionais aceitam `null`. O ID e `criado_em` não são alterados.

A edição retorna o usuário atualizado (200), ID inválido (400), usuário inexistente (404) ou e-mail duplicado (409). Os demais erros retornam 500.
