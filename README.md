# Cifrador

Aplicativo desktop local-first para criar, organizar, transpor, rearmonizar e imprimir repertórios. Ele roda como um programa do Windows, sem navegador e sem servidor web, e salva os dados no perfil do usuário.

## Usar como aplicativo

Para compilar e abrir o programa durante o desenvolvimento:

```bash
npm install
npm run desktop
```

Para gerar o instalador do Windows:

```bash
npm run desktop:package
```

O instalador será criado na pasta `release/`. Depois de instalado, o Cifrador pode ser aberto pelo Menu Iniciar ou pelo atalho da Área de Trabalho.

O modo web continua disponível apenas para desenvolvimento com `npm run dev`.

## Recursos

- editor e pré-visualização de cifras em tempo real;
- acordes no formato `[C]`, `[Am7]`, `[F#m]` e similares;
- transposição de tom, incluindo baixos invertidos;
- biblioteca visual com uma posição escolhida por acorde, considerando facilidade e deslocamento no braço;
- folha redimensionável com painel de acompanhamento automático em até quatro colunas;
- pastas de repertório para organizar e acessar músicas por coleção;
- cadastro de acordes a partir de mapas textuais, com leitura de casa, dedos e pestana;
- reconhecimento de posições como `(9ª casa)`, com deslocamento automático do desenho para a casa indicada;
- braço interativo para adicionar, remover ou reposicionar notas com cliques, além de editar casas, dedos e posição numericamente;
- salvamento individual de um acorde durante a edição de lotes, com opção posterior para salvar todos os restantes juntos;
- biblioteca exclusiva com busca e classificação por maiores, menores, sétimas, quartas e outras extensões;
- rearmonização profissional com inversões, linhas de baixo, acordes de passagem, dominantes secundários e cadências;
- auditoria da rearmonização por compatibilidade melódica, ritmo harmônico, condução do baixo e coerência entre estrofes, com campo opcional para notas importantes da melodia;
- cálculo automático e determinístico de acordes ausentes, com auditoria das notas, do baixo, das cordas e da extensão do braço antes do salvamento;
- organização automática da cifra com IA antes da rearmonização;
- repertório salvo automaticamente no computador;
- busca, duplicação, importação e exportação em JSON;
- impressão limpa, que também permite salvar como PDF;
- tema claro e escuro e layout responsivo.

## Configurar o Ollama

O arquivo `.env` já está criado na raiz e não é enviado ao Git. Para usar o Ollama Cloud, preencha:

```dotenv
OLLAMA_API_KEY=sua_chave_aqui
OLLAMA_BASE_URL=https://ollama.com/api
OLLAMA_MODEL=gemma4:31b
```

Para uma instalação local, a chave pode ficar vazia:

```dotenv
OLLAMA_API_KEY=
OLLAMA_BASE_URL=http://127.0.0.1:11434/api
OLLAMA_MODEL=nome-do-modelo-local
```

Durante o desenvolvimento, reinicie o aplicativo depois de alterar o `.env`. A chave é lida somente pelo processo principal e não é enviada para a interface.

Na versão instalada, coloque uma cópia do `.env` ao lado de `Cifrador.exe`. Sem esse arquivo, o aplicativo tenta usar o Ollama local em `http://127.0.0.1:11434/api`.

## Cadastrar um acorde

Abra **Cadastrar acorde** e informe o nome. Você pode montar a posição clicando diretamente no braço ou, opcionalmente, colar um mapa como:

```text
Casa 3: |---(Pestana do Dedo 1)---|

E  A  D  G  B  e
X  3  5  5  5  3
   1  2  3  4  1
```

O parser reconhece `X` como corda abafada, `0` como corda solta, números como casas, posições entre parênteses e pestanas. A posição declarada, como `(9ª casa)`, é guardada sem deslocar os números do mapa, e pestanas possíveis são identificadas automaticamente. Antes de salvar, a leitura pode ser corrigida diretamente no braço: clique nas casas para adicionar ou remover notas, no topo para alternar corda solta/abafada e use o modo **Pestana** para marcar seu início e fim.

O banco padrão foi auditado a partir do gabarito completo: são 147 acordes e 1.066 mapas únicos, validados pela afinação `E-A-D-G-B-e`, pelo limite de 24 casas e pela janela visual de cinco casas.

## Pastas de músicas

Use **＋ Pasta** no cabeçalho do repertório para criar coleções. As pastas podem ser abertas, recolhidas, renomeadas ou excluídas. Para mover a cifra atual, escolha o destino no campo **Pasta da música**; ao excluir uma pasta, suas músicas continuam disponíveis em **Sem pasta**. Pastas e vínculos também acompanham a exportação e a importação do repertório.

## Estrutura

O projeto foi mantido intencionalmente pequeno, sem frameworks de interface ou SDKs externos desnecessários.

```text
api/
└── ollama.js
desktop/
├── main.js
└── preload.cjs
src/
├── ai-client.js
├── chord-map.js
├── chords.js
├── default-chords.json
├── main.js
├── voicings.js
├── storage.js
└── styles.css
vite.config.js
```

## Dados

No aplicativo do Windows, as músicas e preferências ficam em `%APPDATA%\Cifrador\dados.json`. No modo web de desenvolvimento, continuam no `localStorage`. Use **Exportar** regularmente para criar uma cópia portátil do repertório.
