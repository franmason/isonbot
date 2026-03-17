# 🎵 IsonBot

Bot de música para Discord com suporte a YouTube. Toca músicas por nome ou link diretamente no canal de voz.

---

## Funcionalidades

- Busca músicas por nome ou link do YouTube
- Fila de músicas com múltiplos usuários
- Controles de playback (pausar, resumir, skipar, parar)
- Saída automática quando o canal fica vazio
- Áudio em alta qualidade via Opus 256kbps

---

## Requisitos

- [Node.js](https://nodejs.org) v18 ou superior
- [yt-dlp](https://github.com/yt-dlp/yt-dlp/releases/latest) — baixe o `yt-dlp.exe` e coloque na pasta raiz do projeto
- Token de bot do Discord ([Discord Developer Portal](https://discord.com/developers/applications))

---

## Instalação

```bash
# Clone o repositório
git clone https://github.com/franmason/isonbot.git
cd isonbot

# Instale as dependências
npm install
```

Crie um arquivo `.env` na raiz do projeto:

```env
DISCORD_TOKEN=seu_token_aqui
```

Coloque o `yt-dlp.exe` na pasta raiz do projeto.

---

## Uso

```bash
node index.js
```

Para manter o bot online 24/7, use o [PM2](https://pm2.keymetrics.io):

```bash
npm install -g pm2
pm2 start index.js --name isonbot
pm2 save
pm2 startup
```

---

## Comandos

| Comando | Descrição |
|---|---|
| `!play <música ou link>` | Toca uma música (aliases: `!p`, `!msn`) |
| `!skip` | Pula a música atual |
| `!pause` | Pausa a música |
| `!resume` | Continua a música pausada |
| `!stop` | Para tudo e sai do canal |
| `!fila` | Mostra a fila de músicas |
| `!ajuda` | Mostra esta lista de comandos |

---

## Configuração do Bot no Discord

1. Acesse o [Discord Developer Portal](https://discord.com/developers/applications)
2. Crie uma aplicação e vá em **Bot**
3. Ative as intents: **Message Content Intent** e **Server Members Intent**
4. Em **OAuth2 > URL Generator**, selecione os escopos `bot` e as permissões: `Send Messages`, `Connect`, `Speak`, `Read Message History`
5. Use a URL gerada para convidar o bot ao servidor

---

## Contato

Dúvidas ou sugestões: **franciscomaisun@gmail.com**
