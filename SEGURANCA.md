# Segurança e primeiro acesso

## Criar a conta administrativa

Na pasta `portfolioBackEnd`, execute em um terminal interativo:

```sh
npm run admin:setup
```

Informe e-mail e uma senha de 15 a 128 caracteres. A entrada da senha fica oculta. Não existe cadastro público nem senha padrão. O mesmo comando redefine a conta e revoga todas as sessões anteriores. Nunca informe a senha como argumento de linha de comando ou em variáveis públicas do frontend.

Depois, inicie/reinicie as APIs Node e Python e abra o app Expo. Entre com a conta criada. Visitantes da página pública continuam sem login.

## Armazenamento e sessão

Tudo fica no MySQL/Prisma, para sobreviver aos reinícios de hospedagens com disco temporário: a conta administrativa (`admin_conta`), os hashes das sessões (`admin_sessoes`), a cota de uploads (`upload_cota`) e o PDF do currículo (`curriculo_arquivo`). Crie as tabelas com `npm run db:push`. Dados de uma instalação anterior em `data/security.sqlite3` e `data/uploads/curriculo.pdf` são copiados por `npm run migrate:cloud`.

A senha usa scrypt com salt aleatório (N=32768, r=8, p=3). As sessões são tokens aleatórios de 256 bits; o servidor armazena apenas SHA-256 desses tokens. Expiram em oito horas, com até cinco sessões simultâneas. Logout revoga a sessão no servidor. Redefinir a conta invalida todas.

O app guarda a sessão no SecureStore no Android/iOS. Na web, mantém apenas em memória: recarregar a página exige novo login. As telas administrativas usam rotas protegidas; as APIs validam a sessão independentemente dessas telas.

- `POST /auth/login`: JSON com `email` e `password`; retorna `token`, `expiresAt` e dados mínimos do administrador.
- `GET /auth/session`: valida `Authorization: Bearer <token>`.
- `POST /auth/logout`: revoga o token atual.
- Todas as gravações de `/user`, `/technologies` e `/projects` exigem sessão.
- `GET /user/get` mantém o formato de array para compatibilidade, mas retorna somente o proprietário `1` e campos públicos explícitos.
- `PATCH /user/edit` sempre altera o proprietário `1`. O `id: 1` antigo é aceito por compatibilidade; outro ID é rejeitado.
- A API Python exige a mesma sessão em `GET/POST /knowledge`, consultando o Node a cada requisição. Se o Node não estiver disponível, a operação é bloqueada.

## Limites

| Operação | Limite |
| --- | --- |
| API Node | 180 requisições/minuto/IP |
| Login | 5 tentativas/15 minutos/IP, no máximo 2 verificações de senha simultâneas |
| Gravações | 60 requisições/minuto/IP |
| Upload | 20 tentativas/hora/IP, no máximo 2 uploads simultâneos por processo |
| Cota de arquivos | 500 MB/dia UTC, persistidos no MySQL |
| Imagem | 5 MB, 20 megapixels, 8192 pixels por lado |
| Vídeo | 50 MB, 120 segundos, área máxima de 4096 × 2160 pixels e até 4096 pixels por lado |
| JSON Node | 64 KB |
| Chat | 10 requisições/10 minutos/IP, no máximo 2 simultâneas |
| Chat global | 100 perguntas/dia UTC por padrão; configurável em `CHAT_DAILY_LIMIT` |
| Modelo por pergunta | 3 rodadas, 6 chamadas de ferramentas no total, até 1000 tokens de saída por rodada, sem retries automáticos |
| Base de conhecimento | 10 envios/dia UTC e 1 envio simultâneo; TXT de até 256 KB |

A cota de upload reserva o limite do arquivo antes da leitura e devolve a diferença depois da validação. Tentativas inválidas podem consumir a reserva inteira. Falhas do provedor também contam nas cotas de IA, para evitar tentativas ilimitadas. Os contadores por IP e de concorrência são locais ao processo; use uma instância de cada API. Antes de escalar para várias réplicas, substitua esses contadores por um armazenamento compartilhado.

Os uploads são identificados pelos bytes, não pelo nome ou MIME informado. JPEG, PNG, WebP e GIF são decodificados e regravados como WebP, sem metadados; GIF utiliza o primeiro quadro. SVG e outros formatos não são aceitos. MP4, MOV e WebM passam por inspeção com FFprobe, com timeout e protocolos de rede desabilitados. O upload ao Cloudinary só ocorre após a inspeção.

## Produção

Use HTTPS nas duas APIs. Configure CORS com as origens reais; `Authorization` já é permitido. Somente configure `TRUSTED_PROXY` com os IPs/CIDRs do proxy conhecido. Configure também tamanho, tempo de leitura e frequência no proxy da hospedagem.

No Uvicorn, use `--no-proxy-headers` quando não houver proxy ou configure `--forwarded-allow-ips` apenas para os proxies conhecidos. O middleware Python usa o IP do cliente resolvido pelo servidor, sem confiar diretamente em cabeçalhos enviados pelo visitante.

Além dos limites da aplicação, configure um teto de crédito na chave do provedor de IA. Nenhum limite monetário externo foi alterado automaticamente. A limpeza compensatória de arquivos do Cloudinary e a configuração de privilégios do MySQL não fazem parte desta implementação.

## Verificação

Backend: `npm test`. IA: `.venv\Scripts\python.exe -m unittest -v test_security` na pasta `portfolioAi`. Os testes usam dados isolados, sem gravar no MySQL, enviar arquivos ao Cloudinary ou consumir créditos. App: `npm run typecheck`, `npm run lint` e `npx expo export --platform all`.

As checagens de navegador não substituem a validação do SecureStore e dos fluxos de mídia em um celular real.

Na consulta de dependências desta implementação, `npm audit` reportou três entradas de gravidade alta na cadeia `prisma → @prisma/config → deepmerge-ts` ([aviso](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)). O ajuste sugerido automaticamente troca a versão do Prisma e precisa de uma revisão separada de compatibilidade; não foi aplicado `audit fix --force`. O install do Expo também reportou alertas de dependências: estas mudanças não equivalem a uma auditoria completa da cadeia de pacotes.

Referências: [Expo Router](https://docs.expo.dev/router/advanced/authentication/), [OWASP: senhas](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) e [OWASP: uploads](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).
