# AuditaAerto v8.0.0 corrigida

Versão corrigida em cima da base 7.8.4, preservando login e rotas da API.

Ajustes principais:
- login e backend originais preservados
- responsividade reforçada no portal e nas janelas internas
- módulo interno ocupando mais área útil da tela
- comparador externo aberto dentro do portal, sem botão de nova aba
- endpoint /health preservado

## Como executar

```bash
npm install
npm start
```

Abra `http://localhost:3000`.

v7.8.3

Versão local focada em SPA com login limpo, portal, Rescisão e Auditoria como módulos internos.

# AuditaAerto v7.8 SPA

Esta versão transforma a navegação em SPA para manter o endereço principal curto.

## Fluxo
- `/` abre a tela de login
- após autenticar, a mesma página vira o menu de sistemas
- **Rescisão** abre dentro do próprio portal, sem mudar a URL
- **Cálculo PJ** abre o link oculto configurado por trás do botão

## Usuário inicial
- usuário: `admin`
- senha: `123456`

## Execução local
```bash
npm install
npm start
```

## Variável opcional
- `EXTERNAL_SYSTEM_URL`: endereço do sistema de cálculo PJ oculto no menu

## Observação
As rotas antigas `/rescisao` e `/auditoria` redirecionam para `/` nesta versão para manter o endereço curto.
