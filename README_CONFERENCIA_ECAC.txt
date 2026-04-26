PATCH - Conferência e-CAC / Fontes Pagadoras

Incluído na tela de Auditoria TRCT:
- Importação de informe e-CAC / Receita Federal / Fontes Pagadoras em PDF ou imagem.
- Leitura dos totais: rendimentos tributáveis, previdência oficial, IRRF, rendimentos isentos/sem retenção, 13º/tributação exclusiva e IRRF do 13º.
- Identificação do ano-calendário, beneficiário, fontes pagadoras e códigos de receita quando o texto permite.
- Conferência informativa contra o último cálculo salvo, especialmente quando o informe for do mesmo ano da demissão.

Rotas novas:
- POST /api/ecac/importar
- POST /api/ecac/conferir

Arquivos principais alterados/adicionados:
- public/auditoria.html
- public/modules/auditoria-module.html
- public/js/upload.js
- public/css/style.css
- server.js
- app.js
- src/routes/ecac.routes.js
- src/controllers/ecacController.js
- src/services/normalizadorInformeRendimentos.js
- src/services/comparadorInformeRendimentos.js

Observação:
PDF com texto nativo funciona melhor. Imagem/screenshot depende de OCR disponível no ambiente. Se a leitura vier vazia, imprimir/salvar o e-CAC como PDF pelo navegador costuma melhorar bastante.
