import './styles.css';
import {
  classifyChord,
  escapeHtml,
  extractChords,
  getChordLibrary,
  renderChordDiagram,
  transposeChord,
  transposeContent,
} from './chords.js';
import { describeChord, parseChordMaps } from './chord-map.js';
import { validateChordVoicing } from './chord-theory.js';
import { requestAi } from './ai-client.js';
import { selectChordVoicings } from './voicings.js';
import {
  isValidSong,
  isValidSongFolder,
  loadCustomChords,
  loadLayoutPreferences,
  loadSongFolders,
  loadSongs,
  loadTheme,
  saveCustomChords,
  saveLayoutPreferences,
  saveSongFolders,
  saveSongs,
  saveTheme,
} from './storage.js';

const app = document.querySelector('#app');
const state = {
  songs: loadSongs(),
  folders: loadSongFolders(),
  expandedFolders: new Set(),
  editingFolderId: null,
  selectedId: null,
  filter: '',
  saveTimer: null,
  previewTimer: null,
  previewChordSignature: '',
  pendingAiVoicings: [],
  pendingAiChords: [],
  customChordVersion: 0,
  customChords: loadCustomChords(),
  chordDraft: null,
  chordDrafts: [],
  chordDraftValid: false,
  chordEditMode: 'note',
  editingBatchIndex: null,
  savedBatchIds: new Set(),
  barreAnchor: null,
  chordLibraryFilter: 'Todos',
  layout: loadLayoutPreferences(),
};

state.expandedFolders = new Set(state.folders.map((folder) => folder.id));

if (state.songs.length === 0) state.songs = [createDemoSong()];
state.selectedId = state.songs[0].id;
document.documentElement.dataset.theme = loadTheme();

app.innerHTML = `
  <div class="app-shell">
    <aside class="sidebar" id="sidebar">
      <button class="panel-collapse-button sidebar-collapse-button" id="sidebar-collapse-button" type="button" data-action="collapse-sidebar" aria-controls="sidebar" aria-expanded="true" title="Recolher repertório">‹</button>
      <div class="brand-row">
        <a class="brand" href="#" aria-label="Cifrador — início">
          <span class="brand-mark" aria-hidden="true">C</span>
          <span><strong>Cifrador</strong><small>Seu repertório, no seu tom</small></span>
        </a>
        <button class="icon-button mobile-only" type="button" data-action="toggle-sidebar" aria-label="Fechar menu">×</button>
      </div>

      <button class="primary-button new-song-button" type="button" data-action="new">
        <span aria-hidden="true">＋</span> Nova cifra
      </button>
      <button class="library-button" type="button" data-action="open-library">
        <span aria-hidden="true">♯</span><span><strong>Biblioteca de acordes</strong><small>Diagramas e classificações</small></span>
      </button>

      <label class="search-field">
        <span class="sr-only">Buscar no repertório</span>
        <span aria-hidden="true">⌕</span>
        <input id="song-search" type="search" placeholder="Buscar no repertório" autocomplete="off" />
      </label>

      <div class="library-heading">
        <span>Repertório</span>
        <div><button class="new-folder-button" type="button" data-action="new-folder" title="Criar pasta">＋ Pasta</button><span class="song-count" id="song-count"></span></div>
      </div>
      <nav class="song-list" id="song-list" aria-label="Repertório"></nav>

      <div class="sidebar-footer">
        <button class="quiet-button manage-chords-button" type="button" data-action="open-chords">＋ Cadastrar acorde</button>
        <button class="quiet-button" type="button" data-action="import">Importar</button>
        <button class="quiet-button" type="button" data-action="export">Exportar</button>
        <input id="import-input" type="file" accept="application/json,.json" hidden />
      </div>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <button class="icon-button menu-button" type="button" data-action="toggle-sidebar" aria-label="Abrir repertório">☰</button>
        <div class="save-state" id="save-state"><span></span> Salvo localmente</div>
        <div class="topbar-actions">
          <button class="icon-button" type="button" data-action="theme" aria-label="Alternar tema" title="Alternar tema">◐</button>
          <button class="secondary-button" type="button" data-action="duplicate">Duplicar</button>
          <button class="primary-button compact" type="button" data-action="save">Salvar</button>
        </div>
      </header>

      <section class="chord-library-view" id="chord-library-view" hidden>
        <header class="library-hero">
          <div><span class="section-kicker">BANCO DE ACORDES</span><h1>Biblioteca de acordes</h1><p>Explore por classificação ou clique em qualquer braço para editar a posição.</p></div>
          <div class="library-hero-actions">
            <button class="quiet-button" type="button" data-action="back-songs">← Voltar às cifras</button>
            <button class="primary-button" type="button" data-action="new-chord">＋ Novo acorde</button>
          </div>
        </header>
        <div class="library-tools">
          <label class="search-field library-search"><span aria-hidden="true">⌕</span><input id="chord-search" type="search" placeholder="Buscar acorde, classificação…" /></label>
          <div class="category-filters" id="category-filters"></div>
        </div>
        <div class="library-summary" id="library-summary"></div>
        <div class="chord-library-grid" id="chord-library-grid"></div>
      </section>

      <div class="editor-layout" id="editor-layout">
        <section class="editor-panel" id="editor-panel" aria-labelledby="editor-title">
          <div class="editor-panel-heading">
            <div class="section-kicker" id="editor-title">EDITAR CIFRA</div>
            <button class="panel-collapse-button editor-collapse-button" id="editor-collapse-button" type="button" data-action="collapse-editor" aria-controls="editor-panel" aria-expanded="true" title="Recolher editor">‹</button>
          </div>
          <div class="title-fields">
            <label>
              <span>Título</span>
              <input id="title" name="title" maxlength="100" placeholder="Nome da música" />
            </label>
            <label>
              <span>Artista</span>
              <input id="artist" name="artist" maxlength="100" placeholder="Nome do artista" />
            </label>
          </div>

          <label class="song-folder-field">
            <span>Pasta da música</span>
            <select id="song-folder" name="folderId"></select>
          </label>

          <div class="music-fields">
            <label>
              <span>Tom</span>
              <input id="key" name="key" maxlength="8" placeholder="C" />
            </label>
            <label>
              <span>Capotraste</span>
              <input id="capo" name="capo" type="number" min="0" max="12" inputmode="numeric" />
            </label>
            <label>
              <span>BPM</span>
              <input id="bpm" name="bpm" type="number" min="20" max="300" inputmode="numeric" />
            </label>
          </div>

          <div class="content-heading">
            <label for="content">Letra e acordes</label>
            <span>Use colchetes: <code>[C]</code> <code>[Am7]</code> <code>[F#m]</code></span>
          </div>
          <textarea id="content" name="content" spellcheck="true" aria-label="Letra e acordes"></textarea>
          <button class="organize-cifra-button" id="organize-cifra-button" type="button" data-action="organize-cifra">
            <span class="organize-cifra-icon" aria-hidden="true">✦</span>
            <span><strong>Organizar cifra com IA</strong><small>Padroniza seções, letra e acordes para a rearmonização</small></span>
          </button>

          <div class="editor-actions">
            <div class="transpose-control" aria-label="Transpor cifra">
              <span>Transpor</span>
              <button type="button" data-action="transpose" data-steps="-1" aria-label="Descer meio tom">−</button>
              <strong id="transpose-value">0</strong>
              <button type="button" data-action="transpose" data-steps="1" aria-label="Subir meio tom">＋</button>
            </div>
            <button class="danger-button" type="button" data-action="delete">Excluir cifra</button>
          </div>
        </section>

        <section class="preview-panel" aria-labelledby="preview-title">
          <div class="preview-toolbar">
            <div class="preview-heading">
              <span class="section-kicker">PRÉ-VISUALIZAÇÃO</span>
              <small>Arraste a divisória ao lado da folha para mostrar mais acordes</small>
            </div>
            <div class="preview-actions">
              <button class="ai-button" type="button" data-action="open-ai"><span aria-hidden="true">✦</span> Rearmonizar</button>
              <button class="quiet-button" type="button" data-action="copy">Copiar</button>
              <button class="quiet-button" type="button" data-action="print">Imprimir / PDF</button>
            </div>
          </div>
          <div class="preview-content-layout">
            <article class="song-preview" id="song-preview"></article>
            <div class="preview-resizer" id="preview-resizer" role="separator" aria-label="Redimensionar folha da cifra" aria-orientation="vertical" aria-valuemin="30" aria-valuemax="85" tabindex="0" title="Arraste para redimensionar a folha; clique duas vezes para restaurar">
              <span aria-hidden="true">⋮</span>
            </div>
            <aside class="chords-used" aria-labelledby="chords-title">
              <div class="chords-heading">
                <div><span class="section-kicker">ACOMPANHE</span><h2 id="chords-title">Acordes</h2></div>
                <span id="chord-count"></span>
              </div>
              <div class="chord-grid" id="chord-grid"></div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  </div>
  <div class="sidebar-backdrop" data-action="toggle-sidebar"></div>
  <dialog class="app-dialog ai-dialog" id="ai-dialog">
    <div class="dialog-header">
      <div><span class="dialog-icon" aria-hidden="true">✦</span><div><span class="section-kicker">OLLAMA</span><h2>Rearmonizar com IA</h2></div></div>
      <button class="icon-button" type="button" data-action="close-ai" aria-label="Fechar">×</button>
    </div>
    <div class="dialog-body">
      <div class="ai-status" id="ai-status"><span></span> Verificando configuração…</div>
      <p class="dialog-description">A IA preserva a letra, respeita a melodia e audita ritmo harmônico, linha de baixo e qualquer acorde novo antes de aplicar.</p>
      <div class="dialog-grid">
        <label><span>Estilo harmônico</span>
          <select id="ai-style">
            <option>MPB contemporânea</option>
            <option>Pop acústico</option>
            <option>Gospel</option>
            <option>Jazz suave</option>
            <option>Bossa nova</option>
            <option>Rock</option>
          </select>
        </label>
        <label><span>Intensidade</span>
          <select id="ai-intensity">
            <option value="leve">Leve</option>
            <option value="moderada" selected>Moderada</option>
            <option value="intensa">Intensa</option>
          </select>
        </label>
      </div>
      <label class="stacked-field"><span>Orientações adicionais <small>opcional</small></span>
        <textarea id="ai-instructions" rows="3" placeholder="Ex.: deixe o refrão mais emotivo e mantenha o verso simples."></textarea>
      </label>
      <label class="stacked-field"><span>Guia da melodia <small>opcional, recomendado</small></span>
        <textarea id="ai-melody-guide" rows="2" placeholder="Ex.: em “Temor não há”, a nota de repouso é C#."></textarea>
        <small class="field-help">Informe notas importantes ou pontos de repouso para impedir choques entre a voz e os acordes.</small>
      </label>
      <div class="ai-catalog-note" id="ai-catalog-note"></div>
      <div class="ai-result" id="ai-result" hidden>
        <div><strong>Resultado sugerido</strong><span id="ai-result-meta"></span></div>
        <textarea id="ai-result-content" aria-label="Resultado da rearmonização"></textarea>
      </div>
    </div>
    <div class="dialog-footer">
      <button class="quiet-button" type="button" data-action="close-ai">Cancelar</button>
      <button class="secondary-button" id="apply-ai-button" type="button" data-action="apply-ai" hidden>Aplicar na cifra</button>
      <button class="primary-button ai-generate-button" id="generate-ai-button" type="button" data-action="generate-ai"><span>✦</span> Gerar rearmonização</button>
    </div>
  </dialog>

  <dialog class="app-dialog chord-dialog" id="chord-dialog">
    <div class="dialog-header">
      <div><span class="dialog-icon chord-icon" aria-hidden="true">♯</span><div><span class="section-kicker">BANCO DE ACORDES</span><h2>Cadastrar pelo mapa</h2></div></div>
      <button class="icon-button" type="button" data-action="close-chords" aria-label="Fechar">×</button>
    </div>
    <div class="dialog-body chord-dialog-body">
      <section class="chord-form-column">
        <label class="stacked-field"><span>Nome do acorde <small>opcional ao colar vários</small></span>
          <input id="chord-name" maxlength="24" placeholder="Ex.: Cm" autocomplete="off" />
        </label>
        <label class="stacked-field"><span>Mapa do acorde <small>opcional</small></span>
          <textarea id="chord-map" class="chord-map-input" spellcheck="false" placeholder="Formato rápido: X-3-5-5-X-X&#10;&#10;Ou cole a linha completa:&#10;- **Dó com 5ª (C5):** X-3-5-5-X-X"></textarea>
        </label>
        <p class="field-help">Use o formato rápido <strong>X-3-5-5-X-X</strong>, cole uma linha completa ou monte o acorde clicando no braço. <strong>X</strong> é corda abafada e <strong>0</strong> é corda solta.</p>
      </section>
      <section class="chord-live-preview">
        <span class="section-kicker">LEITURA DO MAPA</span>
        <div id="chord-map-feedback" class="map-feedback">Digite o nome e o mapa para gerar o desenho.</div>
        <button class="map-ai-button" id="correct-chord-map-button" type="button" data-action="correct-chord-map" hidden><span aria-hidden="true">✦</span> Revisar mapa com IA</button>
        <p class="map-edit-hint" id="map-edit-hint">O braço abaixo é editável: clique diretamente nas casas.</p>
        <div id="chord-map-preview" class="map-preview"></div>
      </section>
    </div>
    <div class="dialog-footer">
      <button class="quiet-button" type="button" data-action="close-chords">Fechar</button>
      <button class="primary-button" id="save-chord-button" type="button" data-action="save-chord">Salvar acorde</button>
    </div>
  </dialog>
  <dialog class="app-dialog folder-dialog" id="folder-dialog">
    <div class="dialog-header">
      <div><span class="dialog-icon folder-dialog-icon" aria-hidden="true">▰</span><div><span class="section-kicker">REPERTÓRIO</span><h2 id="folder-dialog-title">Nova pasta</h2></div></div>
      <button class="icon-button" type="button" data-action="close-folder" aria-label="Fechar">×</button>
    </div>
    <div class="dialog-body">
      <label class="stacked-field folder-name-field"><span>Nome da pasta</span><input id="folder-name" maxlength="60" placeholder="Ex.: Louvores, Ensaio, Casamento…" autocomplete="off" /></label>
    </div>
    <div class="dialog-footer">
      <button class="quiet-button" type="button" data-action="close-folder">Cancelar</button>
      <button class="primary-button" type="button" data-action="save-folder">Salvar pasta</button>
    </div>
  </dialog>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
`;

const elements = {
  appShell: document.querySelector('.app-shell'),
  sidebar: document.querySelector('#sidebar'),
  sidebarCollapseButton: document.querySelector('#sidebar-collapse-button'),
  list: document.querySelector('#song-list'),
  count: document.querySelector('#song-count'),
  search: document.querySelector('#song-search'),
  title: document.querySelector('#title'),
  artist: document.querySelector('#artist'),
  songFolder: document.querySelector('#song-folder'),
  key: document.querySelector('#key'),
  capo: document.querySelector('#capo'),
  bpm: document.querySelector('#bpm'),
  content: document.querySelector('#content'),
  organizeCifraButton: document.querySelector('#organize-cifra-button'),
  preview: document.querySelector('#song-preview'),
  previewLayout: document.querySelector('.preview-content-layout'),
  previewResizer: document.querySelector('#preview-resizer'),
  chordGrid: document.querySelector('#chord-grid'),
  chordCount: document.querySelector('#chord-count'),
  transposeValue: document.querySelector('#transpose-value'),
  saveState: document.querySelector('#save-state'),
  importInput: document.querySelector('#import-input'),
  editorLayout: document.querySelector('#editor-layout'),
  editorPanel: document.querySelector('#editor-panel'),
  editorCollapseButton: document.querySelector('#editor-collapse-button'),
  chordLibraryView: document.querySelector('#chord-library-view'),
  chordSearch: document.querySelector('#chord-search'),
  categoryFilters: document.querySelector('#category-filters'),
  librarySummary: document.querySelector('#library-summary'),
  chordLibraryGrid: document.querySelector('#chord-library-grid'),
  aiDialog: document.querySelector('#ai-dialog'),
  aiStatus: document.querySelector('#ai-status'),
  aiStyle: document.querySelector('#ai-style'),
  aiIntensity: document.querySelector('#ai-intensity'),
  aiInstructions: document.querySelector('#ai-instructions'),
  aiMelodyGuide: document.querySelector('#ai-melody-guide'),
  aiCatalogNote: document.querySelector('#ai-catalog-note'),
  aiResult: document.querySelector('#ai-result'),
  aiResultContent: document.querySelector('#ai-result-content'),
  aiResultMeta: document.querySelector('#ai-result-meta'),
  generateAiButton: document.querySelector('#generate-ai-button'),
  applyAiButton: document.querySelector('#apply-ai-button'),
  chordDialog: document.querySelector('#chord-dialog'),
  chordName: document.querySelector('#chord-name'),
  chordMap: document.querySelector('#chord-map'),
  chordMapFeedback: document.querySelector('#chord-map-feedback'),
  correctChordMapButton: document.querySelector('#correct-chord-map-button'),
  mapEditHint: document.querySelector('#map-edit-hint'),
  chordMapPreview: document.querySelector('#chord-map-preview'),
  saveChordButton: document.querySelector('#save-chord-button'),
  folderDialog: document.querySelector('#folder-dialog'),
  folderDialogTitle: document.querySelector('#folder-dialog-title'),
  folderName: document.querySelector('#folder-name'),
  toast: document.querySelector('#toast'),
};

let transposeOffset = 0;
let toastTimer;

initializePreviewResizer();
applyLayoutPreferences();
renderList();
selectSong(state.selectedId);
checkAiStatus();
if (window.location.hash === '#acordes') openChordLibrary();

app.addEventListener('click', handleClick);
app.addEventListener('change', handleDraftFieldChange);
elements.search.addEventListener('input', () => {
  state.filter = elements.search.value.trim().toLocaleLowerCase('pt-BR');
  renderList();
});
elements.importInput.addEventListener('change', importSongs);
elements.chordName.addEventListener('input', handleChordNameInput);
elements.chordMap.addEventListener('input', updateChordMapPreview);
elements.chordSearch.addEventListener('input', renderChordLibrary);
elements.songFolder.addEventListener('change', moveCurrentSongToFolder);
elements.folderName.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveFolderFromDialog();
  }
});

for (const input of [elements.title, elements.artist, elements.key, elements.capo, elements.bpm, elements.content]) {
  input.addEventListener('input', handleEditorInput);
}

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    persistNow('Cifra salva');
  }
});

function handleClick(event) {
  const batchChord = event.target.closest('[data-edit-batch-chord]');
  if (batchChord) {
    editBatchChord(Number(batchChord.dataset.editBatchChord));
    return;
  }

  if (event.target.closest('[data-back-batch]')) {
    closeBatchChordEditor();
    return;
  }

  const libraryChord = event.target.closest('[data-edit-library-chord]');
  if (libraryChord) {
    editChordFromLibrary(libraryChord.dataset.editLibraryChord);
    return;
  }

  const categoryButton = event.target.closest('[data-chord-category]');
  if (categoryButton) {
    state.chordLibraryFilter = categoryButton.dataset.chordCategory;
    if (!elements.chordLibraryView.hidden) renderChordLibrary();
    return;
  }

  const neckCell = event.target.closest('[data-neck-cell]');
  if (neckCell) {
    handleNeckCell(Number(neckCell.dataset.stringIndex), Number(neckCell.dataset.fret));
    return;
  }

  const stringToggle = event.target.closest('[data-string-toggle]');
  if (stringToggle) {
    toggleDraftString(Number(stringToggle.dataset.stringToggle));
    return;
  }

  const neckMode = event.target.closest('[data-neck-mode]');
  if (neckMode) {
    state.chordEditMode = neckMode.dataset.neckMode;
    state.barreAnchor = null;
    renderInteractiveDraft();
    return;
  }

  const startFretButton = event.target.closest('[data-start-fret-step]');
  if (startFretButton) {
    moveDraftWindow(Number(startFretButton.dataset.startFretStep));
    return;
  }

  const removeBarreButton = event.target.closest('[data-remove-barre]');
  if (removeBarreButton) {
    state.chordDraft.barres = [];
    state.barreAnchor = null;
    renderInteractiveDraft();
    return;
  }

  const deleteChordButton = event.target.closest('[data-delete-chord]');
  if (deleteChordButton) {
    deleteCustomChord(deleteChordButton.dataset.deleteChord);
    return;
  }

  const folderToggle = event.target.closest('[data-folder-toggle]');
  if (folderToggle) {
    toggleSongFolder(folderToggle.dataset.folderToggle);
    return;
  }

  const folderRename = event.target.closest('[data-folder-rename]');
  if (folderRename) {
    openFolderDialog(folderRename.dataset.folderRename);
    return;
  }

  const folderDelete = event.target.closest('[data-folder-delete]');
  if (folderDelete) {
    deleteSongFolder(folderDelete.dataset.folderDelete);
    return;
  }

  const songDelete = event.target.closest('[data-delete-song]');
  if (songDelete) {
    deleteSongById(songDelete.dataset.deleteSong);
    return;
  }

  const songButton = event.target.closest('[data-song-id]');
  if (songButton) {
    closeChordLibrary();
    selectSong(songButton.dataset.songId);
    closeSidebar();
    return;
  }

  const button = event.target.closest('[data-action]');
  if (!button) return;

  const actions = {
    new: createSong,
    save: () => persistNow('Cifra salva'),
    duplicate: duplicateSong,
    delete: deleteSong,
    transpose: () => transpose(Number(button.dataset.steps)),
    copy: copySong,
    print: () => window.print(),
    export: exportSongs,
    import: () => elements.importInput.click(),
    'open-ai': openAiDialog,
    'organize-cifra': organizeCifraWithAi,
    'close-ai': () => elements.aiDialog.close(),
    'generate-ai': generateReharmonization,
    'apply-ai': applyAiResult,
    'open-chords': openNewChordDialog,
    'open-library': openChordLibrary,
    'back-songs': closeChordLibrary,
    'new-chord': openNewChordDialog,
    'new-folder': () => openFolderDialog(),
    'close-folder': () => elements.folderDialog.close(),
    'save-folder': saveFolderFromDialog,
    'close-chords': () => elements.chordDialog.close(),
    'save-chord': saveChordFromMap,
    'correct-chord-map': correctChordMapWithAi,
    theme: toggleTheme,
    'toggle-sidebar': toggleSidebar,
    'collapse-sidebar': toggleSidebarCollapse,
    'collapse-editor': toggleEditorCollapse,
  };

  actions[button.dataset.action]?.();
}

function currentSong() {
  return state.songs.find((song) => song.id === state.selectedId);
}

function selectSong(id) {
  const song = state.songs.find((item) => item.id === id);
  if (!song) return;

  state.selectedId = id;
  transposeOffset = 0;
  elements.title.value = song.title;
  elements.artist.value = song.artist || '';
  renderFolderOptions(song.folderId || '');
  elements.key.value = song.key || '';
  elements.capo.value = song.capo || 0;
  elements.bpm.value = song.bpm || '';
  elements.content.value = song.content;
  elements.transposeValue.textContent = '0';
  clearTimeout(state.previewTimer);
  renderList();
  renderPreview();
}

function handleEditorInput(event) {
  const song = currentSong();
  if (!song) return;

  song.title = elements.title.value;
  song.artist = elements.artist.value;
  song.key = elements.key.value;
  song.capo = clampNumber(elements.capo.value, 0, 12, 0);
  song.bpm = clampNumber(elements.bpm.value, 20, 300, null);
  song.content = elements.content.value;
  if (event?.target === elements.content) song.chordVoicings = [];
  song.updatedAt = new Date().toISOString();

  elements.saveState.classList.add('pending');
  elements.saveState.innerHTML = '<span></span> Salvando…';
  if (event?.target !== elements.content) renderList();
  schedulePreview(event?.target === elements.content ? 70 : 0);
  scheduleSave();
}

function schedulePreview(delay = 70) {
  clearTimeout(state.previewTimer);
  state.previewTimer = setTimeout(renderPreview, delay);
}

function scheduleSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => persistNow(), 450);
}

function persistNow(message) {
  clearTimeout(state.saveTimer);
  saveSongs(state.songs);
  elements.saveState.classList.remove('pending');
  elements.saveState.innerHTML = '<span></span> Salvo localmente';
  if (message) showToast(message);
}

function renderList() {
  const folderById = new Map(state.folders.map((folder) => [folder.id, folder]));
  const filtered = state.songs.filter((song) => {
    const folderName = folderById.get(song.folderId)?.name || '';
    const haystack = `${song.title} ${song.artist || ''} ${folderName}`.toLocaleLowerCase('pt-BR');
    return haystack.includes(state.filter);
  });

  elements.count.textContent = state.filter ? `${filtered.length}/${state.songs.length}` : state.songs.length;
  const groups = state.folders.flatMap((folder) => {
    const songs = filtered.filter((song) => song.folderId === folder.id);
    const folderMatches = folder.name.toLocaleLowerCase('pt-BR').includes(state.filter);
    if (state.filter && !songs.length && !folderMatches) return [];
    const expanded = Boolean(state.filter) || state.expandedFolders.has(folder.id);
    return [`
      <section class="song-folder-group ${expanded ? 'expanded' : ''}">
        <div class="song-folder-header">
          <button class="song-folder-toggle" type="button" data-folder-toggle="${escapeHtml(folder.id)}" aria-expanded="${expanded}">
            <span class="folder-chevron" aria-hidden="true">›</span><span class="folder-icon" aria-hidden="true">▰</span><strong>${escapeHtml(folder.name)}</strong><small>${songs.length}</small>
          </button>
          <div class="song-folder-actions">
            <button type="button" data-folder-rename="${escapeHtml(folder.id)}" aria-label="Renomear pasta ${escapeHtml(folder.name)}" title="Renomear">✎</button>
            <button type="button" data-folder-delete="${escapeHtml(folder.id)}" aria-label="Excluir pasta ${escapeHtml(folder.name)}" title="Excluir">×</button>
          </div>
        </div>
        <div class="song-folder-contents" ${expanded ? '' : 'hidden'}>
          ${songs.length ? songs.map(renderSongListItem).join('') : '<div class="empty-folder">Pasta vazia</div>'}
        </div>
      </section>`];
  });
  const unfiled = filtered.filter((song) => !song.folderId || !folderById.has(song.folderId));
  if (unfiled.length) {
    groups.push(`
      <section class="song-folder-group unfiled expanded">
        <div class="song-folder-header static"><span class="folder-icon" aria-hidden="true">□</span><strong>Sem pasta</strong><small>${unfiled.length}</small></div>
        <div class="song-folder-contents">${unfiled.map(renderSongListItem).join('')}</div>
      </section>`);
  }
  elements.list.innerHTML = groups.length ? groups.join('') : '<div class="empty-list">Nenhuma cifra encontrada.</div>';
}

function renderSongListItem(song) {
  return `
    <div class="song-list-row ${song.id === state.selectedId ? 'active' : ''}">
      <button class="song-list-item ${song.id === state.selectedId ? 'active' : ''}" type="button" data-song-id="${escapeHtml(song.id)}">
        <span class="song-initial">${escapeHtml((song.title.trim()[0] || 'C').toUpperCase())}</span>
        <span><strong>${escapeHtml(song.title || 'Sem título')}</strong><small>${escapeHtml(song.artist || 'Artista não informado')}</small></span>
        <em>${escapeHtml(song.key || '—')}</em>
      </button>
      <button class="song-delete-button" type="button" data-delete-song="${escapeHtml(song.id)}" aria-label="Excluir música ${escapeHtml(song.title || 'Sem título')}" title="Excluir música">×</button>
    </div>`;
}

function renderFolderOptions(selectedId = '') {
  elements.songFolder.innerHTML = [
    '<option value="">Sem pasta</option>',
    ...state.folders.map((folder) => `<option value="${escapeHtml(folder.id)}">${escapeHtml(folder.name)}</option>`),
  ].join('');
  elements.songFolder.value = state.folders.some((folder) => folder.id === selectedId) ? selectedId : '';
}

function toggleSongFolder(id) {
  if (state.expandedFolders.has(id)) state.expandedFolders.delete(id);
  else state.expandedFolders.add(id);
  renderList();
}

function openFolderDialog(id = null) {
  const folder = state.folders.find((item) => item.id === id);
  state.editingFolderId = folder?.id || null;
  elements.folderDialogTitle.textContent = folder ? 'Renomear pasta' : 'Nova pasta';
  elements.folderName.value = folder?.name || '';
  elements.folderDialog.showModal();
  requestAnimationFrame(() => elements.folderName.focus());
}

function saveFolderFromDialog() {
  const name = elements.folderName.value.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!name) {
    showToast('Informe o nome da pasta.', true);
    elements.folderName.focus();
    return;
  }
  const duplicate = state.folders.some((folder) =>
    folder.id !== state.editingFolderId && folder.name.localeCompare(name, 'pt-BR', { sensitivity: 'base' }) === 0);
  if (duplicate) {
    showToast('Já existe uma pasta com esse nome.', true);
    return;
  }

  if (state.editingFolderId) {
    const folder = state.folders.find((item) => item.id === state.editingFolderId);
    if (folder) folder.name = name;
    showToast('Pasta renomeada');
  } else {
    const folder = { id: createId(), name, createdAt: new Date().toISOString() };
    state.folders.push(folder);
    state.expandedFolders.add(folder.id);
    showToast('Pasta criada');
  }
  saveSongFolders(state.folders);
  elements.folderDialog.close();
  renderFolderOptions(currentSong()?.folderId || '');
  renderList();
}

function deleteSongFolder(id) {
  const folder = state.folders.find((item) => item.id === id);
  if (!folder) return;
  const songCount = state.songs.filter((song) => song.folderId === id).length;
  const detail = songCount ? ` As ${songCount} música${songCount === 1 ? '' : 's'} ficarão em “Sem pasta”.` : '';
  if (!window.confirm(`Excluir a pasta “${folder.name}”?${detail}`)) return;

  state.folders = state.folders.filter((item) => item.id !== id);
  state.expandedFolders.delete(id);
  for (const song of state.songs) {
    if (song.folderId === id) song.folderId = '';
  }
  saveSongFolders(state.folders);
  persistNow();
  renderFolderOptions(currentSong()?.folderId || '');
  renderList();
  showToast('Pasta excluída; as músicas foram preservadas');
}

function moveCurrentSongToFolder() {
  const song = currentSong();
  if (!song) return;
  const folderId = elements.songFolder.value;
  song.folderId = state.folders.some((folder) => folder.id === folderId) ? folderId : '';
  song.updatedAt = new Date().toISOString();
  if (song.folderId) state.expandedFolders.add(song.folderId);
  renderList();
  persistNow();
  const folder = state.folders.find((item) => item.id === song.folderId);
  showToast(folder ? `Música movida para “${folder.name}”` : 'Música movida para “Sem pasta”');
}

function renderPreview() {
  clearTimeout(state.previewTimer);
  const song = currentSong();
  if (!song) return;

  const metadata = [
    song.key && `Tom ${song.key}`,
    song.capo > 0 && `Capo ${song.capo}ª casa`,
    song.bpm && `${song.bpm} BPM`,
  ].filter(Boolean);

  const body = song.content.trim()
    ? song.content.split('\n').map(renderSongLine).join('')
    : '<p class="empty-preview">Sua cifra aparecerá aqui enquanto você escreve.</p>';

  elements.preview.innerHTML = `
    <header>
      <p class="preview-eyebrow">CIFRA</p>
      <h1 id="preview-title">${escapeHtml(song.title || 'Sem título')}</h1>
      <p class="preview-artist">${escapeHtml(song.artist || 'Artista não informado')}</p>
      ${metadata.length ? `<div class="preview-meta">${metadata.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}
    </header>
    <div class="formatted-song">${body}</div>`;

  const chords = extractChords(song.content);
  const preferredSignature = (song.chordVoicings || []).map((item) => `${item.name}:${item.id}`).join('\u0000');
  const chordSignature = `${state.customChordVersion}:${chords.join('\u0000')}:${preferredSignature}`;
  if (chordSignature === state.previewChordSignature) return;
  state.previewChordSignature = chordSignature;
  const voicings = getSongChordVoicings(song, chords);
  elements.chordCount.textContent = chords.length
    ? `${voicings.length} ${voicings.length === 1 ? 'acorde escolhido' : 'acordes escolhidos'}`
    : '0 acordes';
  elements.chordGrid.innerHTML = voicings.length
    ? voicings.map((chord) => renderChordDiagram(chord, state.customChords)).join('')
    : '<p class="empty-chords">Adicione acordes entre colchetes para ver os diagramas.</p>';
}

function getSongChordVoicings(song, chordNames) {
  const library = getChordLibrary(state.customChords);
  return selectChordVoicings(song.content || chordNames, library, song.chordVoicings || []);
}

function getAiChordCatalog() {
  const library = getChordLibrary(state.customChords);
  const names = [...new Set(library.map((chord) => chord.name))];
  return selectChordVoicings(names, library);
}

function renderSongLine(line) {
  if (!line.trim()) return '<div class="song-spacer" aria-hidden="true"></div>';

  const displayLine = line.trimStart();

  if (/^#/.test(displayLine)) {
    return `<h3 class="song-section">${escapeHtml(displayLine.replace(/^#+\s*/, ''))}</h3>`;
  }

  const chordPattern = /\[([^\]\n]+)]/g;
  const matches = [...displayLine.matchAll(chordPattern)];
  if (matches.length === 0) return `<div class="lyric-line">${escapeHtml(displayLine)}</div>`;
  const onlyChords = displayLine.replace(chordPattern, '').trim() === '';

  const lead = displayLine.slice(0, matches[0].index);
  const pairEntries = matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? displayLine.length;
    const lyric = displayLine.slice(start, end);
    return {
      hasLyric: Boolean(lyric.trim()),
      html: `<span class="chord-pair${lyric.trim() ? '' : ' chord-pair--transition'}"><b>${escapeHtml(match[1])}</b><span>${escapeHtml(lyric) || '&nbsp;'}</span></span>`,
    };
  });
  let pairs;
  if (onlyChords) {
    pairs = pairEntries.map((entry) => entry.html).join('');
  } else {
    const phrases = [];
    let preparation = '';
    for (const entry of pairEntries) {
      if (!entry.hasLyric) {
        preparation += entry.html;
        continue;
      }
      phrases.push(`<span class="chord-phrase">${preparation}${entry.html}</span>`);
      preparation = '';
    }
    if (preparation) phrases.push(`<span class="chord-phrase">${preparation}</span>`);
    pairs = phrases.join('');
  }

  return `<div class="song-line${onlyChords ? ' instrumental-line' : ''}">${lead ? `<span class="lyric-lead">${escapeHtml(lead)}</span>` : ''}${pairs}</div>`;
}

async function checkAiStatus() {
  try {
    const status = await requestAi('status');
    elements.aiStatus.className = `ai-status ${status.configured ? 'ready' : 'warning'}`;
    elements.aiStatus.innerHTML = `<span></span> ${status.configured ? 'Pronto' : 'Configuração pendente'} · ${escapeHtml(status.provider)} · ${escapeHtml(status.model)}`;
    elements.generateAiButton.disabled = !status.configured;
    elements.organizeCifraButton.disabled = !status.configured;
    elements.correctChordMapButton.disabled = !status.configured;
  } catch {
    elements.aiStatus.className = 'ai-status warning';
    elements.aiStatus.innerHTML = '<span></span> Não foi possível acessar a configuração do Ollama.';
    elements.generateAiButton.disabled = true;
    elements.organizeCifraButton.disabled = true;
    elements.correctChordMapButton.disabled = true;
  }
}

function openAiDialog() {
  const library = getAiChordCatalog();
  const used = extractChords(currentSong()?.content || '');
  const known = used.filter((name) => library.some((chord) => chord.name === name));
  elements.aiCatalogNote.innerHTML = `<strong>${library.length} acordes disponíveis</strong><span>${known.length} dos ${used.length} acordes atuais foram encontrados no banco.</span>`;
  elements.aiResult.hidden = true;
  elements.applyAiButton.hidden = true;
  state.pendingAiVoicings = [];
  state.pendingAiChords = [];
  checkAiStatus();
  elements.aiDialog.showModal();
}

async function generateReharmonization() {
  const song = currentSong();
  if (!song) return;

  setAiLoading(true);
  elements.aiResult.hidden = true;
  elements.applyAiButton.hidden = true;

  try {
    const payload = await requestAi('reharmonize', {
      content: song.content,
      title: song.title,
      artist: song.artist,
      key: song.key,
      style: elements.aiStyle.value,
      intensity: elements.aiIntensity.value,
      instructions: elements.aiInstructions.value,
      melodyGuide: elements.aiMelodyGuide.value,
      chords: getAiChordCatalog(),
    });

    elements.aiResultContent.value = payload.content;
    state.pendingAiVoicings = Array.isArray(payload.voicings) ? payload.voicings : [];
    state.pendingAiChords = Array.isArray(payload.createdChords) ? payload.createdChords : [];
    const resultDetails = [
      payload.model && `Modelo ${payload.model}`,
      state.pendingAiVoicings.length && `${state.pendingAiVoicings.length} posições escolhidas`,
      state.pendingAiChords.length && `${state.pendingAiChords.length} acordes novos auditados`,
      payload.harmonicAudit?.status === 'approved' && 'fluxo harmônico auditado',
      payload.harmonicAudit?.melodyChecks > 0 && `${payload.harmonicAudit.melodyChecks} ponto melódico conferido`,
    ].filter(Boolean);
    elements.aiResultMeta.textContent = resultDetails.join(' · ');
    elements.aiResult.hidden = false;
    elements.applyAiButton.hidden = false;
    showToast('Rearmonização pronta para revisar');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setAiLoading(false);
  }
}

async function organizeCifraWithAi() {
  const song = currentSong();
  if (!song || song.content.trim().length < 10) {
    showToast('Escreva ou cole uma cifra antes de organizar.', true);
    return;
  }

  setOrganizeLoading(true);
  try {
    const payload = await requestAi('organize', {
      content: song.content,
      key: song.key,
      chords: getAiChordCatalog(),
    });

    elements.content.value = payload.content;
    handleEditorInput();
    persistNow('Cifra organizada e salva');
    elements.content.focus();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setOrganizeLoading(false);
  }
}

function setOrganizeLoading(isLoading) {
  elements.organizeCifraButton.disabled = isLoading;
  elements.organizeCifraButton.classList.toggle('loading', isLoading);
  elements.organizeCifraButton.innerHTML = isLoading
    ? '<span class="spinner"></span><span><strong>Organizando a cifra…</strong><small>A IA está separando seções, letra e acordes</small></span>'
    : '<span class="organize-cifra-icon" aria-hidden="true">✦</span><span><strong>Organizar cifra com IA</strong><small>Padroniza seções, letra e acordes para a rearmonização</small></span>';
}

function setAiLoading(isLoading) {
  elements.generateAiButton.disabled = isLoading;
  elements.generateAiButton.classList.toggle('loading', isLoading);
  elements.generateAiButton.innerHTML = isLoading
    ? '<span class="spinner"></span> Rearmonizando…'
    : '<span>✦</span> Gerar rearmonização';
}

function applyAiResult() {
  const song = currentSong();
  const content = elements.aiResultContent.value.trim();
  if (!song || !content) return;

  const usedNames = new Set(extractChords(content)
    .map((name) => name.replace(/\s+/g, '').toLocaleLowerCase('pt-BR')));
  const pendingChords = state.pendingAiChords.filter((chord) =>
    usedNames.has(chord.name.replace(/\s+/g, '').toLocaleLowerCase('pt-BR')));
  const createdChords = pendingChords.filter((chord) => validateChordVoicing(chord).valid);
  if (createdChords.length !== pendingChords.length) {
    showToast('Um acorde novo não passou pela auditoria e a rearmonização não foi aplicada.', true);
    return;
  }
  const availableNames = new Set([
    ...getChordLibrary(state.customChords).map((chord) => chord.name.replace(/\s+/g, '').toLocaleLowerCase('pt-BR')),
    ...createdChords.map((chord) => chord.name.replace(/\s+/g, '').toLocaleLowerCase('pt-BR')),
  ]);
  const missing = extractChords(content).filter((name) =>
    !availableNames.has(name.replace(/\s+/g, '').toLocaleLowerCase('pt-BR')));
  if (missing.length) {
    showToast(`Revise estes acordes antes de aplicar: ${missing.join(', ')}.`, true);
    return;
  }

  if (createdChords.length) {
    const createdIds = new Set(createdChords.map((chord) => chord.id));
    const createdMaps = new Set(createdChords.map((chord) => `${chord.name}:${chord.frets.join(',')}`));
    state.customChords = [
      ...createdChords,
      ...state.customChords.filter((chord) =>
        !createdIds.has(chord.id) && !createdMaps.has(`${chord.name}:${chord.frets.join(',')}`)),
    ];
    state.customChordVersion += 1;
    saveCustomChords(state.customChords);
  }

  song.content = content;
  song.chordVoicings = state.pendingAiVoicings.filter((item) =>
    usedNames.has(item.name.replace(/\s+/g, '').toLocaleLowerCase('pt-BR')));
  song.updatedAt = new Date().toISOString();
  elements.content.value = content;
  renderPreview();
  persistNow(createdChords.length
    ? `Rearmonização aplicada e ${createdChords.length} acordes novos salvos`
    : 'Rearmonização aplicada');
  elements.aiDialog.close();
}

function openNewChordDialog() {
  elements.chordName.value = '';
  elements.chordMap.value = '';
  state.chordDraft = null;
  state.chordDrafts = [];
  state.chordDraftValid = false;
  state.chordEditMode = 'note';
  state.editingBatchIndex = null;
  state.savedBatchIds.clear();
  state.barreAnchor = null;
  updateChordSaveButton();
  elements.mapEditHint.textContent = 'O braço abaixo é editável: clique diretamente nas casas.';
  updateChordMapPreview();
  elements.chordDialog.showModal();
  setTimeout(() => elements.chordName.focus(), 50);
}

function updateChordMapPreview() {
  const name = elements.chordName.value.trim();
  const map = elements.chordMap.value.trim();
  const editingId = state.chordDraft?.id;
  const editingVariant = state.chordDraft?.variant;
  state.editingBatchIndex = null;
  state.savedBatchIds.clear();
  elements.correctChordMapButton.hidden = !map;
  updateChordSaveButton();
  elements.mapEditHint.textContent = 'O braço abaixo é editável: clique diretamente nas casas.';

  if (!name && !map) {
    state.chordDraft = null;
    state.chordDrafts = [];
    state.chordDraftValid = false;
    elements.chordMapFeedback.className = 'map-feedback';
    elements.chordMapFeedback.textContent = 'Digite um nome ou cole uma lista de acordes para começar.';
    elements.correctChordMapButton.innerHTML = '<span aria-hidden="true">✦</span> Corrigir mapa com IA';
    elements.chordMapPreview.innerHTML = '';
    updateChordSaveButton();
    return;
  }

  if (!map) {
    if (!name) return;
    state.chordDraft = createBlankChord(name);
    state.chordDrafts = [state.chordDraft];
    state.chordDraftValid = true;
    state.chordEditMode = 'note';
    state.barreAnchor = null;
    elements.chordMapFeedback.className = 'map-feedback success';
    elements.chordMapFeedback.textContent = 'Braço vazio criado. Clique nas casas para montar o acorde.';
    elements.correctChordMapButton.hidden = true;
    elements.chordMapPreview.innerHTML = renderChordDraftEditor(state.chordDraft);
    updateChordSaveButton();
    return;
  }

  try {
    const chords = parseChordMaps(map, name);
    const isBatch = chords.length > 1;
    const chord = chords[0];
    if (!isBatch && chord.name !== name) elements.chordName.value = chord.name;
    if (!isBatch && editingId) chord.id = editingId;
    if (!isBatch && editingVariant) chord.variant = editingVariant;
    state.chordDrafts = chords;
    state.chordDraft = chord;
    state.chordDraftValid = true;
    state.chordEditMode = 'note';
    state.barreAnchor = null;
    elements.chordMapFeedback.className = 'map-feedback success';
    elements.correctChordMapButton.innerHTML = '<span aria-hidden="true">✦</span> Revisar mapa com IA';
    if (isBatch) {
      elements.chordMapFeedback.textContent = `${chords.length} acordes reconhecidos. Confira todos antes de salvar.`;
      elements.mapEditHint.textContent = 'Clique em “Editar acorde” para alterar casas, dedos ou a posição diretamente no braço.';
      updateChordSaveButton();
      elements.chordMapPreview.innerHTML = renderChordBatchPreview(chords);
    } else {
      elements.chordMapFeedback.textContent = describeChord(chord);
      elements.chordMapPreview.innerHTML = renderChordDraftEditor(chord);
      updateChordSaveButton();
    }
  } catch (error) {
    state.chordDraft = null;
    state.chordDrafts = [];
    state.chordDraftValid = false;
    elements.chordMapFeedback.className = 'map-feedback error';
    elements.chordMapFeedback.textContent = error.message;
    elements.correctChordMapButton.innerHTML = '<span aria-hidden="true">✦</span> Corrigir mapa com IA';
    elements.chordMapPreview.innerHTML = '';
    updateChordSaveButton();
  }
}

function renderChordBatchPreview(chords) {
  return `<div class="batch-chord-grid">${chords.map((chord, index) => {
    const isSaved = state.savedBatchIds.has(chord.id);
    return `
    <div class="batch-chord-preview${isSaved ? ' saved' : ''}">
      ${isSaved ? '<span class="batch-saved-badge">✓ Salvo</span>' : ''}
      ${renderChordDiagram(chord)}
      ${chord.variant ? `<small>${escapeHtml(chord.variant)}</small>` : ''}
      <code>${chord.frets.map((fret) => fret < 0 ? 'X' : fret).join('-')}</code>
      <button class="batch-chord-edit-button" type="button" data-edit-batch-chord="${index}">${isSaved ? 'Editar novamente' : 'Editar acorde'}</button>
    </div>`;
  }).join('')}</div>`;
}

function editBatchChord(index) {
  const chord = state.chordDrafts[index];
  if (!chord) return;
  state.editingBatchIndex = index;
  state.chordDraft = chord;
  state.chordEditMode = 'note';
  state.barreAnchor = null;
  elements.mapEditHint.textContent = 'Edite clicando no braço ou alterando os números abaixo.';
  renderInteractiveDraft();
}

function closeBatchChordEditor() {
  if (state.chordDrafts.length < 2) return;
  state.editingBatchIndex = null;
  state.chordDraft = state.chordDrafts[0];
  state.chordEditMode = 'note';
  state.barreAnchor = null;
  const savedCount = state.savedBatchIds.size;
  elements.chordMapFeedback.className = 'map-feedback success';
  elements.chordMapFeedback.textContent = savedCount
    ? `${savedCount} ${savedCount === 1 ? 'acorde salvo' : 'acordes salvos'}. Você pode salvar os restantes juntos.`
    : `${state.chordDrafts.length} acordes reconhecidos. Confira todos antes de salvar.`;
  elements.mapEditHint.textContent = 'Clique em “Editar acorde” para alterar casas, dedos ou a posição diretamente no braço.';
  elements.chordMapPreview.innerHTML = renderChordBatchPreview(state.chordDrafts);
  updateChordSaveButton();
}

function updateChordSaveButton() {
  const button = elements.saveChordButton;
  const isBatch = state.chordDrafts.length > 1;
  button.disabled = false;

  if (!isBatch) {
    button.textContent = 'Salvar acorde';
    return;
  }

  if (Number.isInteger(state.editingBatchIndex)) {
    button.textContent = state.savedBatchIds.has(state.chordDraft?.id)
      ? 'Atualizar somente este acorde'
      : 'Salvar somente este acorde';
    return;
  }

  const remaining = state.chordDrafts.filter((chord) => !state.savedBatchIds.has(chord.id)).length;
  if (remaining === 0) {
    button.textContent = 'Todos os acordes foram salvos';
    button.disabled = true;
  } else if (state.savedBatchIds.size === 0) {
    button.textContent = `Salvar ${remaining} acordes`;
  } else if (remaining === 1) {
    button.textContent = 'Salvar o outro acorde';
  } else {
    button.textContent = `Salvar os ${remaining} acordes restantes`;
  }
}

async function correctChordMapWithAi() {
  const map = elements.chordMap.value.trim();
  if (!map) return;

  setChordMapAiLoading(true);
  try {
    const payload = await requestAi('chord-map', {
      name: elements.chordName.value.trim(),
      map,
    });

    const correctedChords = Array.isArray(payload.chords) ? payload.chords : [];
    if (correctedChords.length > 1) {
      elements.chordName.value = '';
      const sameName = correctedChords.every((chord) => chord.name === correctedChords[0].name);
      elements.chordMap.value = sameName
        ? `${correctedChords[0].name}\n\n${correctedChords.map((chord, index) => {
          const house = chord.variant?.match(/^(\d+ª casa)/)?.[1];
          return `${index + 1}. ${house ? `(${house}) ` : ''}${chord.map}`;
        }).join('\n')}`
        : correctedChords.map((chord) => `${chord.name}: ${chord.map}`).join('\n');
    } else {
      const corrected = correctedChords[0] || payload;
      elements.chordName.value = corrected.name || elements.chordName.value;
      elements.chordMap.value = corrected.map || map;
    }
    updateChordMapPreview();
    showToast('Mapa revisado pela IA');
  } catch (error) {
    elements.chordMapFeedback.className = 'map-feedback error';
    elements.chordMapFeedback.textContent = error.message;
  } finally {
    setChordMapAiLoading(false);
  }
}

function setChordMapAiLoading(isLoading) {
  elements.correctChordMapButton.disabled = isLoading;
  if (isLoading) {
    elements.correctChordMapButton.innerHTML = '<span class="spinner"></span> Revisando mapa…';
  } else {
    elements.correctChordMapButton.innerHTML = state.chordDraftValid
      ? '<span aria-hidden="true">✦</span> Revisar mapa com IA'
      : '<span aria-hidden="true">✦</span> Corrigir mapa com IA';
  }
}

function handleChordNameInput() {
  if (state.chordDrafts.length > 1) {
    updateChordMapPreview();
    return;
  }
  if (!state.chordDraft) {
    updateChordMapPreview();
    return;
  }

  const name = elements.chordName.value.trim();
  state.chordDraft.name = name;
  state.chordDraftValid = Boolean(name);
  if (name) renderInteractiveDraft();
  elements.chordMapFeedback.className = name ? 'map-feedback success' : 'map-feedback error';
  elements.chordMapFeedback.textContent = name ? describeChord(state.chordDraft) : 'Informe o nome do acorde.';
}

function renderChordDraftEditor(chord) {
  const stringNames = ['6ª E', '5ª A', '4ª D', '3ª G', '2ª B', '1ª e'];
  const isBatchEdit = Number.isInteger(state.editingBatchIndex) && state.chordDrafts.length > 1;
  const visibleFrets = Array.from({ length: 5 }, (_, index) => chord.startFret + index);
  const barre = chord.barres?.[0];
  const instruction = state.chordEditMode === 'barre'
    ? state.barreAnchor
      ? 'Agora clique na última corda da pestana, na mesma casa.'
      : 'Clique na primeira corda da pestana e depois na última.'
    : 'Clique em uma casa para adicionar ou remover uma nota.';

  return `
    <div class="interactive-chord-editor">
      ${isBatchEdit ? `
        <div class="batch-editor-heading">
          <button type="button" data-back-batch>← Todos os acordes</button>
          <strong>Editando ${escapeHtml(chord.name)}</strong>
        </div>` : ''}
      <div class="neck-mode-switch" aria-label="Ferramenta do braço">
        <button type="button" data-neck-mode="note" class="${state.chordEditMode === 'note' ? 'active' : ''}">● Notas</button>
        <button type="button" data-neck-mode="barre" class="${state.chordEditMode === 'barre' ? 'active' : ''}">▬ Pestana</button>
      </div>
      <p class="neck-instruction">${instruction}</p>
      <div class="fret-window-control">
        <button type="button" data-start-fret-step="-1" aria-label="Mostrar casas anteriores">−</button>
        <strong>Casa ${chord.startFret}</strong>
        <button type="button" data-start-fret-step="1" aria-label="Mostrar próximas casas">＋</button>
      </div>
      <div class="clickable-neck" aria-label="Braço editável do acorde ${escapeHtml(chord.name)}">
        <div class="neck-grid neck-tuning"><span></span>${stringNames.map((name) => `<strong>${name}</strong>`).join('')}</div>
        <div class="neck-grid neck-string-state"><span></span>${chord.frets.map((fret, string) => `
          <button type="button" data-string-toggle="${string}" aria-label="Alternar corda ${stringNames[string]} entre solta e abafada">${fret === -1 ? '×' : fret === 0 ? '○' : '•'}</button>`).join('')}</div>
        ${visibleFrets.map((fret) => `
          <div class="neck-grid neck-fret-row">
            <span>${fret}ª</span>
            ${chord.frets.map((selectedFret, string) => {
              const isSelected = selectedFret === fret;
              const isBarred = Boolean(barre && barre.fret === fret && string >= Math.min(barre.fromString, barre.toString) && string <= Math.max(barre.fromString, barre.toString));
              const isAnchor = state.barreAnchor?.fret === fret && state.barreAnchor?.string === string;
              return `<button type="button" class="neck-cell${isSelected ? ' selected' : ''}${isBarred ? ' barred' : ''}${isAnchor ? ' anchor' : ''}" data-neck-cell data-string-index="${string}" data-fret="${fret}" aria-label="${stringNames[string]}, casa ${fret}"><span>${isSelected && chord.fingers[string] ? chord.fingers[string] : ''}</span></button>`;
            }).join('')}
          </div>`).join('')}
      </div>
      <div class="interactive-neck-footer">
        <span>${escapeHtml(classifyChord(chord))}</span>
        ${barre ? '<button type="button" data-remove-barre>Remover pestana</button>' : ''}
      </div>
      <section class="chord-values-editor" aria-label="Valores do acorde">
        <div class="chord-values-heading">
          ${isBatchEdit ? `<label><span>Nome</span><input type="text" maxlength="24" value="${escapeHtml(chord.name)}" data-draft-name /></label>` : ''}
          <label><span>Casa inicial</span><input type="number" min="1" max="20" value="${chord.startFret}" data-draft-start-fret /></label>
        </div>
        <div class="chord-value-row">
          <strong>Casas</strong>
          ${chord.frets.map((fret, string) => `<label><span>${stringNames[string]}</span><input type="text" inputmode="numeric" maxlength="2" value="${fret < 0 ? 'X' : fret}" data-draft-fret="${string}" aria-label="Casa da ${stringNames[string]}" /></label>`).join('')}
        </div>
        <div class="chord-value-row">
          <strong>Dedos</strong>
          ${chord.fingers.map((finger, string) => `<label><span>${stringNames[string]}</span><input type="number" min="0" max="4" value="${finger || 0}" data-draft-finger="${string}" aria-label="Dedo da ${stringNames[string]}" /></label>`).join('')}
        </div>
        <small>Nas casas, use <b>X</b> para corda abafada e <b>0</b> para corda solta. Nos dedos, use de 1 a 4 ou 0.</small>
      </section>
    </div>`;
}

function handleDraftFieldChange(event) {
  const chord = state.chordDraft;
  if (!chord) return;
  const target = event.target;

  if (target.matches('[data-draft-name]')) {
    const name = target.value.trim().slice(0, 24);
    if (!name) {
      showToast('Informe o nome do acorde.', true);
      renderInteractiveDraft();
      return;
    }
    chord.name = name;
  } else if (target.matches('[data-draft-start-fret]')) {
    const startFret = Number(target.value);
    if (!Number.isInteger(startFret) || startFret < 1 || startFret > 20) {
      showToast('A casa inicial deve estar entre 1 e 20.', true);
      renderInteractiveDraft();
      return;
    }
    chord.startFret = startFret;
    updateDraftVariant(chord);
  } else if (target.matches('[data-draft-fret]')) {
    const string = Number(target.dataset.draftFret);
    const rawValue = target.value.trim();
    const fret = /^x$/i.test(rawValue) ? -1 : Number(rawValue);
    if (!Number.isInteger(fret) || fret < -1 || fret > 24) {
      showToast('Use X ou uma casa entre 0 e 24.', true);
      renderInteractiveDraft();
      return;
    }
    chord.frets[string] = fret;
    if (fret <= 0) chord.fingers[string] = 0;
    else if (!chord.fingers[string]) chord.fingers[string] = Math.min(4, Math.max(1, fret - chord.startFret + 1));
    chord.barres = [];
    if (fret > 0 && (fret < chord.startFret || fret > chord.startFret + 4)) {
      chord.startFret = Math.min(20, fret);
      updateDraftVariant(chord);
    }
  } else if (target.matches('[data-draft-finger]')) {
    const string = Number(target.dataset.draftFinger);
    const finger = Number(target.value);
    if (!Number.isInteger(finger) || finger < 0 || finger > 4) {
      showToast('A numeração dos dedos deve estar entre 0 e 4.', true);
      renderInteractiveDraft();
      return;
    }
    chord.fingers[string] = chord.frets[string] > 0 ? finger : 0;
  } else {
    return;
  }

  state.chordDraftValid = Boolean(chord.name);
  renderInteractiveDraft();
}

function updateDraftVariant(chord) {
  if (!chord.variant) return;
  const position = chord.variant.match(/posição\s+\d+/i)?.[0];
  if (position) chord.variant = `${chord.startFret}ª casa · ${position}`;
}

function handleNeckCell(stringIndex, fret) {
  const chord = state.chordDraft;
  if (!chord) return;

  if (state.chordEditMode === 'barre') {
    if (!state.barreAnchor || state.barreAnchor.fret !== fret) {
      state.barreAnchor = { string: stringIndex, fret };
    } else {
      let fromString = Math.min(state.barreAnchor.string, stringIndex);
      let toString = Math.max(state.barreAnchor.string, stringIndex);
      if (fromString === toString) toString = 5;
      chord.barres = [{ fret, fromString, toString, finger: 1 }];
      for (let string = fromString; string <= toString; string += 1) {
        if (chord.frets[string] <= fret) chord.frets[string] = fret;
        if (chord.frets[string] === fret) chord.fingers[string] = 1;
      }
      state.barreAnchor = null;
      state.chordEditMode = 'note';
    }
  } else if (chord.frets[stringIndex] === fret) {
    chord.frets[stringIndex] = 0;
    chord.fingers[stringIndex] = 0;
  } else {
    chord.frets[stringIndex] = fret;
    chord.fingers[stringIndex] = Math.min(4, Math.max(1, fret - chord.startFret + 1));
  }

  state.chordDraftValid = true;
  renderInteractiveDraft();
}

function toggleDraftString(stringIndex) {
  const chord = state.chordDraft;
  if (!chord) return;
  chord.frets[stringIndex] = chord.frets[stringIndex] === -1 ? 0 : -1;
  chord.fingers[stringIndex] = 0;
  chord.barres = (chord.barres || []).filter((barre) => stringIndex < barre.fromString || stringIndex > barre.toString);
  renderInteractiveDraft();
}

function moveDraftWindow(step) {
  if (!state.chordDraft) return;
  state.chordDraft.startFret = Math.min(20, Math.max(1, state.chordDraft.startFret + step));
  updateDraftVariant(state.chordDraft);
  state.barreAnchor = null;
  renderInteractiveDraft();
}

function renderInteractiveDraft() {
  const chord = state.chordDraft;
  if (!chord) return;
  if (Number.isInteger(state.editingBatchIndex) && state.chordDrafts[state.editingBatchIndex]) {
    state.chordDrafts[state.editingBatchIndex] = chord;
  } else {
    state.chordDrafts = [chord];
  }
  chord.rawMap = chordToText(chord);
  elements.chordMapPreview.innerHTML = renderChordDraftEditor(chord);
  updateChordSaveButton();
  elements.chordMapFeedback.className = 'map-feedback success';
  elements.chordMapFeedback.textContent = Number.isInteger(state.editingBatchIndex)
    ? `Editando ${chord.name}: ${describeChord(chord)}`
    : describeChord(chord);
}

function editChordFromLibrary(id) {
  const chord = getChordLibrary(state.customChords).find((item) => item.id === id);
  if (!chord) return;
  state.chordDraft = {
    ...structuredClone(chord),
    id: chord.id || createId(),
    fingers: chord.fingers?.length === 6 ? [...chord.fingers] : inferDraftFingers(chord.frets, chord.startFret),
    barres: structuredClone(chord.barres || []),
    custom: true,
  };
  state.chordDrafts = [state.chordDraft];
  state.chordDraftValid = true;
  state.chordEditMode = 'note';
  state.editingBatchIndex = null;
  state.savedBatchIds.clear();
  state.barreAnchor = null;
  elements.chordName.value = chord.name;
  elements.chordMap.value = chord.rawMap || chordToText(chord);
  updateChordSaveButton();
  elements.mapEditHint.textContent = 'O braço abaixo é editável: clique diretamente nas casas.';
  renderInteractiveDraft();
  elements.chordDialog.showModal();
}

function inferDraftFingers(frets, startFret) {
  return frets.map((fret) => fret > 0 ? Math.min(4, Math.max(1, fret - startFret + 1)) : 0);
}

function chordToText(chord) {
  const frets = chord.frets.map((fret) => fret === -1 ? 'X' : fret).join(' - ');
  return `Início: ${chord.startFret}ª casa\nTablatura: ${frets}`;
}

function createBlankChord(name) {
  return {
    id: createId(),
    name,
    frets: [-1, -1, -1, -1, -1, -1],
    fingers: [0, 0, 0, 0, 0, 0],
    barres: [],
    startFret: 1,
    rawMap: '',
    custom: true,
    updatedAt: new Date().toISOString(),
  };
}

function saveChordFromMap() {
  try {
    if (!state.chordDraft || !state.chordDraftValid) throw new Error('Corrija a leitura do mapa antes de salvar.');
    const isBatch = state.chordDrafts.length > 1;
    if (isBatch && Number.isInteger(state.editingBatchIndex)) {
      saveCurrentBatchChord();
      return;
    }

    const sourceChords = isBatch
      ? state.chordDrafts.filter((chord) => !state.savedBatchIds.has(chord.id))
      : [state.chordDraft];
    const chords = structuredClone(sourceChords);
    if (chords.length === 0) throw new Error('Todos os acordes deste lote já foram salvos.');
    if (!isBatch) chords[0].name = elements.chordName.value.trim();
    for (const chord of chords) {
      chord.updatedAt = new Date().toISOString();
      validateChordDraft(chord);
    }
    persistChordDrafts(chords);
    elements.chordName.value = '';
    elements.chordMap.value = '';
    state.chordDraft = null;
    state.chordDrafts = [];
    state.chordDraftValid = false;
    state.editingBatchIndex = null;
    state.savedBatchIds.clear();
    updateChordMapPreview();
    showToast(chords.length === 1
      ? `${chords[0].name} salvo no banco de acordes`
      : `${chords.length} acordes salvos no banco`);
    elements.chordDialog.close();
  } catch (error) {
    elements.chordMapFeedback.className = 'map-feedback error';
    elements.chordMapFeedback.textContent = error.message;
  }
}

function saveCurrentBatchChord() {
  const chord = structuredClone(state.chordDraft);
  chord.updatedAt = new Date().toISOString();
  validateChordDraft(chord);
  persistChordDrafts([chord]);
  state.chordDraft.updatedAt = chord.updatedAt;
  state.savedBatchIds.add(chord.id);
  const remaining = state.chordDrafts.filter((item) => !state.savedBatchIds.has(item.id)).length;
  closeBatchChordEditor();
  showToast(remaining
    ? `${chord.name} salvo. Os outros podem ser salvos juntos.`
    : `${chord.name} atualizado. Todos os acordes foram salvos.`);
}

function persistChordDrafts(chords) {
  const savedIds = new Set(chords.map((chord) => chord.id));
  state.customChords = [
    ...chords,
    ...state.customChords.filter((item) => !savedIds.has(item.id)),
  ];
  state.customChordVersion += 1;
  saveCustomChords(state.customChords);
  if (!elements.chordLibraryView.hidden) renderChordLibrary();
  renderPreview();
}

function openChordLibrary() {
  elements.editorLayout.hidden = true;
  elements.chordLibraryView.hidden = false;
  document.body.classList.add('chord-library-mode');
  if (window.location.hash !== '#acordes') history.replaceState(null, '', '#acordes');
  closeSidebar();
  renderChordLibrary();
}

function closeChordLibrary() {
  elements.editorLayout.hidden = false;
  elements.chordLibraryView.hidden = true;
  document.body.classList.remove('chord-library-mode');
  if (window.location.hash === '#acordes') history.replaceState(null, '', window.location.pathname + window.location.search);
}

function renderChordLibrary() {
  const categoryOrder = [
    'Maiores', 'Menores', 'Com sétima', 'Sétimas maiores', 'Menores com sétima', 'Sétimas com quarta',
    'Quartas suspensas', 'Quartas com quinta aumentada', 'Segundas suspensas', 'Com sexta', 'Adicionados', 'Diminutos', 'Aumentados', 'Outros',
  ];
  const library = getChordLibrary(state.customChords)
    .map((chord) => ({ ...chord, category: classifyChord(chord) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }) || a.startFret - b.startFret);
  const categories = categoryOrder.filter((category) => library.some((chord) => chord.category === category));
  if (state.chordLibraryFilter !== 'Todos' && !categories.includes(state.chordLibraryFilter)) {
    state.chordLibraryFilter = 'Todos';
  }

  elements.categoryFilters.innerHTML = ['Todos', ...categories].map((category) => {
    const count = category === 'Todos' ? library.length : library.filter((chord) => chord.category === category).length;
    return `<button type="button" class="${state.chordLibraryFilter === category ? 'active' : ''}" data-chord-category="${escapeHtml(category)}">${escapeHtml(category)} <span>${count}</span></button>`;
  }).join('');

  const query = elements.chordSearch.value.trim().toLocaleLowerCase('pt-BR');
  const filtered = library.filter((chord) => {
    const matchesCategory = state.chordLibraryFilter === 'Todos' || chord.category === state.chordLibraryFilter;
    const matchesSearch = `${chord.name} ${chord.category} ${chord.variant || ''}`.toLocaleLowerCase('pt-BR').includes(query);
    return matchesCategory && matchesSearch;
  });
  elements.librarySummary.textContent = `${filtered.length} ${filtered.length === 1 ? 'acorde encontrado' : 'acordes encontrados'}`;

  const visibleCategories = state.chordLibraryFilter === 'Todos'
    ? categories.filter((category) => filtered.some((chord) => chord.category === category))
    : [state.chordLibraryFilter];
  elements.chordLibraryGrid.innerHTML = filtered.length
    ? visibleCategories.map((category) => `
        <section class="chord-category-section">
          <header><h2>${escapeHtml(category)}</h2><span>${filtered.filter((chord) => chord.category === category).length}</span></header>
          <div class="category-chord-grid">
            ${filtered.filter((chord) => chord.category === category).map(renderLibraryChordCard).join('')}
          </div>
        </section>`).join('')
    : '<div class="empty-library"><strong>Nenhum acorde encontrado</strong><span>Tente outra busca ou cadastre uma nova posição.</span></div>';
}

function renderLibraryChordCard(chord) {
  return `
    <article class="library-chord-card">
      <div class="library-card-meta"><span>${escapeHtml(chord.variant || chord.category)}</span>${chord.source === 'Personalizado' ? `<span class="custom-card-actions"><em>Seu acorde</em><button type="button" data-delete-chord="${escapeHtml(chord.id)}" aria-label="Excluir acorde ${escapeHtml(chord.name)}">×</button></span>` : ''}</div>
      <button type="button" class="library-chord-button" data-edit-library-chord="${escapeHtml(chord.id)}" aria-label="Editar acorde ${escapeHtml(chord.name)}${chord.variant ? `, ${escapeHtml(chord.variant)}` : ''}">
        ${renderChordDiagram(chord, state.customChords)}
        <span class="edit-neck-label">Clique no braço para editar</span>
      </button>
    </article>`;
}

function validateChordDraft(chord) {
  if (!chord.name) throw new Error('Informe o nome do acorde.');
  if (chord.frets.length !== 6 || chord.frets.some((fret) => !Number.isInteger(fret) || fret < -1 || fret > 24)) {
    throw new Error('Cada corda precisa ter uma casa entre 0 e 24, ou X.');
  }
  if (chord.frets.every((fret) => fret === -1)) throw new Error('Marque ao menos uma corda no braço do acorde.');
  if (chord.fingers.length !== 6 || chord.fingers.some((finger) => !Number.isInteger(finger) || finger < 0 || finger > 4)) {
    throw new Error('Os dedos devem estar entre 0 e 4.');
  }
  if ((chord.barres || []).some((barre) =>
    !Number.isInteger(barre.fret) || barre.fret < 1 || barre.fret > 24 ||
    !Number.isInteger(barre.fromString) || barre.fromString < 0 || barre.fromString > 5 ||
    !Number.isInteger(barre.toString) || barre.toString < 0 || barre.toString > 5 ||
    !Number.isInteger(barre.finger) || barre.finger < 1 || barre.finger > 4,
  )) {
    throw new Error('Revise a casa, as cordas e o dedo da pestana.');
  }
}

function deleteCustomChord(id) {
  const chord = state.customChords.find((item) => item.id === id);
  if (!chord || !window.confirm(`Excluir o acorde “${chord.name}”?`)) return;
  state.customChords = state.customChords.filter((item) => item.id !== id);
  state.customChordVersion += 1;
  saveCustomChords(state.customChords);
  renderChordLibrary();
  renderPreview();
  showToast('Acorde personalizado excluído');
}

function createSong() {
  closeChordLibrary();
  const song = createEmptySong(currentSong()?.folderId || '');
  state.songs.unshift(song);
  persistNow();
  selectSong(song.id);
  elements.title.focus();
  showToast('Nova cifra criada');
}

function duplicateSong() {
  const source = currentSong();
  if (!source) return;
  const copy = {
    ...source,
    id: createId(),
    title: `${source.title || 'Sem título'} — cópia`,
    updatedAt: new Date().toISOString(),
  };
  state.songs.unshift(copy);
  persistNow();
  selectSong(copy.id);
  showToast('Cifra duplicada');
}

function deleteSong() {
  deleteSongById(state.selectedId);
}

function deleteSongById(id) {
  const index = state.songs.findIndex((item) => item.id === id);
  const song = state.songs[index];
  if (!song || !window.confirm(`Excluir a música “${song.title || 'Sem título'}”? Esta ação não pode ser desfeita.`)) return;

  state.songs = state.songs.filter((item) => item.id !== song.id);
  if (state.songs.length === 0) state.songs.push(createEmptySong(song.folderId || ''));
  persistNow();
  if (state.selectedId === song.id) {
    selectSong(state.songs[Math.min(index, state.songs.length - 1)].id);
  } else {
    renderList();
  }
  showToast('Música excluída do repertório');
}

function transpose(steps) {
  const song = currentSong();
  if (!song) return;

  song.content = transposeContent(song.content, steps);
  song.chordVoicings = [];
  song.key = song.key ? transposeChord(song.key, steps) : '';
  song.updatedAt = new Date().toISOString();
  transposeOffset += steps;
  elements.content.value = song.content;
  elements.key.value = song.key;
  elements.transposeValue.textContent = transposeOffset > 0 ? `+${transposeOffset}` : transposeOffset;
  renderPreview();
  renderList();
  scheduleSave();
}

async function copySong() {
  const song = currentSong();
  if (!song) return;
  const text = `${song.title}\n${song.artist || ''}\n\n${song.content}`.trim();
  try {
    await navigator.clipboard.writeText(text);
    showToast('Cifra copiada');
  } catch {
    elements.content.select();
    document.execCommand('copy');
    showToast('Conteúdo copiado');
  }
}

function exportSongs() {
  persistNow();
  const payload = JSON.stringify({
    version: 4,
    exportedAt: new Date().toISOString(),
    songs: state.songs,
    folders: state.folders,
    customChords: state.customChords,
  }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `cifrador-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Repertório exportado');
}

async function importSongs(event) {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;

  try {
    const payload = JSON.parse(await file.text());
    const imported = Array.isArray(payload) ? payload : payload.songs;
    if (!Array.isArray(imported)) throw new Error('Formato inválido');

    const songs = imported.filter(isValidSong).map(normalizeSong);
    if (songs.length === 0) throw new Error('Nenhuma cifra válida');

    if (!Array.isArray(payload) && Array.isArray(payload.folders)) {
      const importedFolders = payload.folders.filter(isValidSongFolder).map((folder) => ({
        id: folder.id,
        name: folder.name.trim().replace(/\s+/g, ' ').slice(0, 60),
        createdAt: isDate(folder.createdAt) ? folder.createdAt : new Date().toISOString(),
      }));
      const folderMap = new Map(state.folders.map((folder) => [folder.id, folder]));
      for (const folder of importedFolders) folderMap.set(folder.id, folder);
      state.folders = [...folderMap.values()];
      state.expandedFolders = new Set(state.folders.map((folder) => folder.id));
      saveSongFolders(state.folders);
    }
    state.songs = mergeSongs(state.songs, songs);
    if (Array.isArray(payload.customChords)) {
      const importedChords = payload.customChords.filter((chord) =>
        chord && typeof chord.name === 'string' && Array.isArray(chord.frets) && chord.frets.length === 6,
      );
      const chordMap = new Map(state.customChords.map((chord) => [chord.id || createId(), chord]));
      for (const chord of importedChords) chordMap.set(chord.id || createId(), chord);
      state.customChords = [...chordMap.values()];
      state.customChordVersion += 1;
      saveCustomChords(state.customChords);
      if (!elements.chordLibraryView.hidden) renderChordLibrary();
    }
    persistNow();
    selectSong(songs[0].id);
    showToast(`${songs.length} ${songs.length === 1 ? 'cifra importada' : 'cifras importadas'}`);
  } catch {
    showToast('Não foi possível importar o arquivo', true);
  }
}

function mergeSongs(current, imported) {
  const byId = new Map(current.map((song) => [song.id, song]));
  for (const song of imported) byId.set(song.id, song);
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  saveTheme(next);
}

function toggleSidebarCollapse() {
  state.layout.sidebarCollapsed = !state.layout.sidebarCollapsed;
  saveLayoutPreferences(state.layout);
  applyLayoutPreferences();
}

function toggleEditorCollapse() {
  state.layout.editorCollapsed = !state.layout.editorCollapsed;
  saveLayoutPreferences(state.layout);
  applyLayoutPreferences();
}

function applyLayoutPreferences() {
  const sidebarCollapsed = state.layout.sidebarCollapsed;
  const editorCollapsed = state.layout.editorCollapsed;

  elements.appShell.classList.toggle('sidebar-collapsed', sidebarCollapsed);
  elements.editorLayout.classList.toggle('editor-collapsed', editorCollapsed);

  elements.sidebarCollapseButton.textContent = sidebarCollapsed ? '›' : '‹';
  elements.sidebarCollapseButton.setAttribute('aria-expanded', String(!sidebarCollapsed));
  elements.sidebarCollapseButton.setAttribute('aria-label', sidebarCollapsed ? 'Expandir repertório' : 'Recolher repertório');
  elements.sidebarCollapseButton.title = sidebarCollapsed ? 'Expandir repertório' : 'Recolher repertório';

  elements.editorCollapseButton.textContent = editorCollapsed ? '›' : '‹';
  elements.editorCollapseButton.setAttribute('aria-expanded', String(!editorCollapsed));
  elements.editorCollapseButton.setAttribute('aria-label', editorCollapsed ? 'Expandir editor' : 'Recolher editor');
  elements.editorCollapseButton.title = editorCollapsed ? 'Expandir editor' : 'Recolher editor';

  requestAnimationFrame(() => applyStoredPreviewWidth());
}

function initializePreviewResizer() {
  let dragging = false;

  const setFromPointer = (clientX) => {
    const bounds = elements.previewLayout.getBoundingClientRect();
    if (!bounds.width) return;
    const minWidth = Math.min(360, bounds.width * 0.55);
    const maxWidth = Math.max(minWidth, bounds.width - 150 - elements.previewResizer.offsetWidth);
    const width = Math.min(maxWidth, Math.max(minWidth, clientX - bounds.left));
    setPreviewWidthRatio(width / bounds.width);
  };

  elements.previewResizer.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragging = true;
    elements.previewResizer.setPointerCapture(event.pointerId);
    elements.previewResizer.classList.add('dragging');
    setFromPointer(event.clientX);
    event.preventDefault();
  });
  elements.previewResizer.addEventListener('pointermove', (event) => {
    if (dragging) setFromPointer(event.clientX);
  });
  elements.previewResizer.addEventListener('pointerup', (event) => {
    if (!dragging) return;
    dragging = false;
    elements.previewResizer.releasePointerCapture(event.pointerId);
    elements.previewResizer.classList.remove('dragging');
    saveLayoutPreferences(state.layout);
  });
  elements.previewResizer.addEventListener('dblclick', () => {
    state.layout.previewWidthRatio = null;
    elements.previewLayout.style.removeProperty('--song-preview-width');
    saveLayoutPreferences(state.layout);
  });
  elements.previewResizer.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') {
      state.layout.previewWidthRatio = null;
      elements.previewLayout.style.removeProperty('--song-preview-width');
    } else {
      const current = Number(state.layout.previewWidthRatio) || 0.72;
      setPreviewWidthRatio(current + (event.key === 'ArrowRight' ? 0.03 : -0.03));
    }
    saveLayoutPreferences(state.layout);
  });
}

function setPreviewWidthRatio(value) {
  const ratio = Math.min(0.85, Math.max(0.3, Number(value) || 0.72));
  state.layout.previewWidthRatio = ratio;
  elements.previewLayout.style.setProperty('--song-preview-width', `${ratio * 100}%`);
  elements.previewResizer.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
}

function applyStoredPreviewWidth() {
  if (Number.isFinite(state.layout.previewWidthRatio)) setPreviewWidthRatio(state.layout.previewWidthRatio);
  else elements.previewLayout.style.removeProperty('--song-preview-width');
}

function toggleSidebar() {
  document.body.classList.toggle('sidebar-open');
}

function closeSidebar() {
  document.body.classList.remove('sidebar-open');
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = `toast visible${isError ? ' error' : ''}`;
  toastTimer = setTimeout(() => {
    elements.toast.classList.remove('visible');
  }, 2600);
}

function createEmptySong(folderId = '') {
  return normalizeSong({
    id: createId(),
    title: '',
    artist: '',
    key: 'C',
    capo: 0,
    bpm: null,
    content: '# Verso\n[C]Comece a escrever sua [G]cifra aqui…',
    folderId,
    updatedAt: new Date().toISOString(),
  });
}

function createDemoSong() {
  return normalizeSong({
    id: 'boas-vindas',
    title: 'Primeiros acordes',
    artist: 'Cifrador',
    key: 'C',
    capo: 0,
    bpm: 92,
    content: '# Intro\n[C]  [Am]  [F]  [G]\n\n# Verso\n[C]Cada acorde abre um [Am]caminho\n[F]Cada verso encontra o seu [G]lugar\n[C]Guarde aqui o seu re[Am]pertório\n[F]E escolha o tom para can[G]tar\n\n# Refrão\n[F]Leve a música com [G]você\n[Em]Pronta para recome[Am]çar\n[F]Um semitom de cada [G]vez\n[C]Até a voz se encaixar',
    updatedAt: new Date().toISOString(),
  });
}

function normalizeSong(song) {
  return {
    id: typeof song.id === 'string' && song.id ? song.id : createId(),
    title: String(song.title || '').slice(0, 100),
    artist: String(song.artist || '').slice(0, 100),
    key: String(song.key || '').slice(0, 8),
    capo: clampNumber(song.capo, 0, 12, 0),
    bpm: clampNumber(song.bpm, 20, 300, null),
    content: String(song.content || ''),
    chordVoicings: Array.isArray(song.chordVoicings) ? song.chordVoicings
      .filter((item) => item && typeof item.name === 'string' && typeof item.id === 'string')
      .map((item) => ({ name: item.name, id: item.id })) : [],
    folderId: typeof song.folderId === 'string' ? song.folderId : '',
    updatedAt: isDate(song.updatedAt) ? song.updatedAt : new Date().toISOString(),
  };
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clampNumber(value, min, max, fallback) {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function isDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}
