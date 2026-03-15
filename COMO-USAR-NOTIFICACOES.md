# Guia: Como Fazer Notificações Funcionarem no Celular

## O Problema
As notificações do sistema **NÃO FUNCIONAM** quando você abre o arquivo direto da pasta (`file://`).

## A Solução

### Opção 1: Usar Live Server (MAIS FÁCIL)
1. Abra o VS Code
2. Instale a extensão "Live Server"
3. Clique com o botão direito no `index.html`
4. Selecione "Open with Live Server"
5. Acesse pelo celular usando o IP do seu computador (ex: `http://192.168.1.100:5500`)

### Opção 2: Hospedar Online (GRÁTIS)
1. Crie uma conta no GitHub
2. Faça upload dos arquivos para um repositório
3. Ative o GitHub Pages nas configurações
4. Acesse pelo celular usando a URL do GitHub Pages

### Por Que Não Funciona com file://
- Navegadores bloqueiam notificações de sistema por segurança
- Precisa de um endereço `http://` ou `https://`
- É uma restrição do navegador, não do código

## Configuração no Celular
1. Acesse o site via servidor/hospedagem
2. Clique no sino no dashboard
3. Permita as notificações quando o navegador perguntar
4. Pronto! Agora as vendas aparecerão mesmo com o celular bloqueado
