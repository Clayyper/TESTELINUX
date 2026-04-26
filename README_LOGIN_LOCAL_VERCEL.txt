LOGIN 100% HÍBRIDO - LOCAL + VERCEL

LOCAL:
1) Abra a pasta no VS Code.
2) Rode: npm start
3) Acesse: http://localhost:3000
4) Login padrão local:
   Usuário: admin
   Senha: 282728

VERCEL:
Cadastre em Settings > Environment Variables:
ADMIN_USER=admin
ADMIN_PASS=282728
AUTH_SECRET=troque_por_um_texto_grande_e_secreto
SESSION_SECRET=troque_por_um_texto_grande_e_secreto
EXTERNAL_SYSTEM_URL=https://lcauditt.vercel.app/
NODE_ENV=production

OBS:
- O server.js não depende mais de dotenv/express para o login funcionar.
- Localmente ele lê o arquivo .env automaticamente.
- Na Vercel ele usa as variáveis configuradas no painel.
- Rota para testar configuração: /api/debug-config
