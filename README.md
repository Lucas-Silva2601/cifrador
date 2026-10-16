# Cifrador

**Seu repertório, no seu tom.** Aplicativo *local-first* para criar, organizar, transpor, rearmonizar e imprimir cifras — no navegador durante o desenvolvimento e como programa de Windows (Electron) no uso final.

## ✨ Destaques

**Repertório**

- Músicas organizadas em pastas (criar, renomear, excluir, recolher)
- Busca instantânea por título, artista e pasta
- Duplicar, importar e exportar o repertório em JSON
- Salvamento automático local + indicador "Salvo localmente"

**Cifras**

- Editor com pré-visualização em tempo real (`[C]`, `[Am7]`, `[F#m]`…)
- Transposição de tom com suporte a baixos invertidos
- Organização automática da cifra com IA antes de rearmonizar
- Folha de impressão limpa (vale como PDF) com painel de acompanhamento em até 4 colunas

**Acordes**

- Biblioteca visual com busca e classificação (maiores, menores, sétimas, suspensas, diminutos, aumentados…)
- 147 acordes e 1.066 mapas auditados (afinação `E-A-D-G-B-e`, até 24 casas)
- Cadastro por mapa textual ou clicando no braço interativo (notas, pestana, corda solta/abafada)
- Reconhecimento de `(9ª casa)` com deslocamento automático do desenho

**IA (Ollama)**

- Rearmonização com inversões, linhas de baixo, acordes de passagem, dominantes secundários e cadências
- Auditoria de compatibilidade melódica, ritmo harmônico, condução do baixo e coerência entre estrofes
- Organização de cifras e revisão de mapas de acordes

## 🧰 Stack

| Camada     | Tecnologia                          |
| ---------- | ----------------------------------- |
| Front      | Next.js 15, React 19, Tailwind CSS 3 |
| Desktop    | Electron + electron-builder (NSIS)  |
| IA         | Ollama (local ou Cloud) via API routes |
| Dados      | localStorage (web) · `%APPDATA%` (desktop) |
| Testes     | `node --test`                       |

## 🚀 Comece em 2 minutos

```bash
npm install
npm run dev:open   # sobe em http://localhost:3000 e abre o navegador
```

Sem abertura automática:

```bash
npm run dev        # só o servidor
```

Produção local:

```bash
npm run build
npm run start:open # serve o build e abre o navegador
```

Parar e reiniciar:

```bash
npm run stop          # fecha o servidor na porta 3000
npm run stop:all      # fecha o servidor + o Electron
npm run restart       # para e sobe de novo (modo dev, sem abrir aba)
npm run restart:open  # para e sobe de novo abrindo o navegador
```

> Para outra porta: `PORT=4000 npm run stop`. Para reiniciar em modo produção: `node scripts/restart-app.mjs start --open` (após `npm run build`).

Aplicativo Windows:

```bash
npm run desktop           # build + abre o Electron (dev)
npm run desktop:package   # gera o instalador em release/
```

> Para trocar a porta: `PORT=4000 npm run dev:open`.

## 📜 Scripts

| Comando             | O que faz                                        |
| ------------------- | ------------------------------------------------ |
| `dev` / `dev:open`  | Next em modo dev, sem / com abertura do navegador |
| `build`             | Build de produção do Next                        |
| `start` / `start:open` | Serve o build, sem / com abertura do navegador |
| `stop` / `stop:all` | Fecha o servidor (porta 3000); `:all` inclui o Electron |
| `restart` / `restart:open` | Para e sobe de novo em dev, sem / com abertura do navegador |
| `desktop`           | Build + abre o app Electron                      |
| `desktop:package`   | Gera o instalador Windows (NSIS) em `release/`   |
| `desktop:dir`       | Gera a pasta executável sem instalador           |
| `test`              | Roda a suíte de testes (`node --test`)           |
| `legacy:dev`        | App antigo em Vite (referência)                  |

A abertura automática usa `scripts/open-app.mjs`: aguarda o Next responder e abre a aba no navegador padrão (Windows, macOS e Linux). A parada usa `scripts/stop-app.mjs` (localiza o PID pela porta e finaliza) e o reinício usa `scripts/restart-app.mjs` (para, depois sobe em `dev` ou `start`).

## 🤖 IA com Ollama

Copie `.env.example` para `.env`:

```dotenv
OLLAMA_API_KEY=sua_chave_aqui
OLLAMA_BASE_URL=https://ollama.com/api
OLLAMA_MODEL=gemma4:31b
```

Instalação local (sem chave):

```dotenv
OLLAMA_API_KEY=
OLLAMA_BASE_URL=http://127.0.0.1:11434/api
OLLAMA_MODEL=nome-do-modelo-local
```

- Reinicie o app após alterar o `.env`.
- A chave é lida só no servidor — nunca vai para o navegador.
- No app instalado, coloque uma cópia do `.env` ao lado de `Cifrador.exe`. Sem ele, o app tenta o Ollama local em `http://127.0.0.1:11434/api`.

## 🎸 Cadastrar um acorde

Em **＋ Cadastrar acorde**, informe o nome e monte a posição no braço — ou cole um mapa:

```text
Casa 3: |---(Pestana do Dedo 1)---|

E  A  D  G  B  e
X  3  5  5  5  3
   1  2  3  4  1
```

O parser entende `X` (abafada), `0` (solta), números (casas), `(9ª casa)` e pestanas, com correção direto no braço antes de salvar. Dá para salvar um acorde no meio de um lote e concluir os restantes depois.

## 📁 Pastas de músicas

Use **＋ Pasta** no cabeçalho do repertório. Para mover a cifra atual, troque o campo **Pasta da música** no editor. Ao excluir uma pasta, as músicas são preservadas em **Sem pasta** — e tudo acompanha a exportação/importação.

## 🗂️ Estrutura

```text
app/
├── layout.js / page.jsx      # shell HTML e composição das telas
├── globals.css               # Tailwind + legado
├── ui-polish.css             # espaçamento da UI (editor, diálogos, biblioteca)
└── api/ai/                   # status (GET) · reharmonize/organize/chord-map (POST)
components/                   # Sidebar · Editor · Preview · ChordLibrary · ChordDialog · AiDialog
hooks/useCifrador.js          # estado global (músicas, pastas, acordes, layout)
lib/                          # teoria, mapas, voicings, render, storage, cliente/server IA
scripts/open-app.mjs          # dev:open / start:open
desktop/ · src/ · api/        # Electron e legado Vite (referência)
```

## 💾 Dados

- **Desktop (Windows):** `%APPDATA%\Cifrador\dados.json`
- **Web (dev):** `localStorage`
- Exporte com frequência em **Exportar** para ter uma cópia portátil do repertório.
