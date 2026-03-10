// Chrome Note 侧边栏应用 - 重构版
const STORAGE_KEY = 'dashnote_list';
const SETTINGS_KEY = 'dashnote_settings';

// 状态管理
let activeNoteId = null;
let modeByNoteId = {}; // 'collapsed' | 'expanded' | 'editing'
let isFullscreenByNoteId = {};
let isSelectMode = false;
let selectedNotes = new Set();
let settings = {
  dateDisplay: 'updatedAt'
};

// 初始化应用
async function initApp() {
  setupEventListeners();
  await loadSettings();

  const notes = await getNotes();

  // 首次打开（没有笔记），直接创建新笔记
  if (notes.length === 0) {
    await createNewNote();
  } else {
    // 初始化所有笔记状态
    notes.forEach(note => {
      modeByNoteId[note.id] = 'collapsed';
      isFullscreenByNoteId[note.id] = false;
    });
    await loadNotesList();
  }

  updateFloatingButton();
}

// 设置事件监听
function setupEventListeners() {
  document.getElementById('btnNew').addEventListener('click', createNewNote);
  document.getElementById('btnSearch').addEventListener('click', toggleSearch);
  document.getElementById('btnClearSearch').addEventListener('click', closeSearch);
  document.getElementById('searchBox').addEventListener('input', handleSearch);
  document.getElementById('btnSelect').addEventListener('click', toggleSelectMode);
  document.getElementById('btnCopySelected').addEventListener('click', copySelectedNotes);
  document.getElementById('btnDeleteSelected').addEventListener('click', deleteSelectedNotes);
  document.getElementById('btnSettings').addEventListener('click', openSettings);
  document.getElementById('btnCloseSettings').addEventListener('click', closeSettings);
  document.getElementById('floatingCollapseBtn').addEventListener('click', collapseActiveNote);

  // 设置选项点击
  document.querySelectorAll('.radio-option').forEach(option => {
    option.addEventListener('click', function() {
      const value = this.getAttribute('data-value');
      updateDateDisplaySetting(value);
    });
  });
}

// 存储操作
async function getNotes() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

async function saveNotes(notes) {
  await chrome.storage.local.set({ [STORAGE_KEY]: notes });
}

// 加载设置
async function loadSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  if (data[SETTINGS_KEY]) {
    settings = data[SETTINGS_KEY];
  }

  // 同步 UI 选中状态
  document.querySelectorAll('.radio-option').forEach(option => {
    if (option.getAttribute('data-value') === settings.dateDisplay) {
      option.classList.add('selected');
    } else {
      option.classList.remove('selected');
    }
  });
}

// 保存设置
async function saveSettings() {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

// 更新日期显示设置
async function updateDateDisplaySetting(value) {
  settings.dateDisplay = value;
  await saveSettings();

  // 更新 UI
  document.querySelectorAll('.radio-option').forEach(option => {
    if (option.getAttribute('data-value') === value) {
      option.classList.add('selected');
    } else {
      option.classList.remove('selected');
    }
  });

  // 重新渲染列表
  await loadNotesList();
}

// PLACEHOLDER_FOR_MORE_FUNCTIONS

// 加载笔记列表
async function loadNotesList() {
  const notes = await getNotes();
  renderNotesList(notes);
}

// 渲染笔记列表
function renderNotesList(notes) {
  const notesList = document.getElementById('notesList');
  notesList.innerHTML = '';

  if (notes.length === 0) {
    notesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <div class="empty-text">还没有笔记<br>点击下方按钮开始创建</div>
        <button class="btn-new-large" id="btnNewEmpty">
          <span>+</span>
          <span>新建笔记</span>
        </button>
      </div>
    `;
    document.getElementById('btnNewEmpty').addEventListener('click', createNewNote);
    return;
  }

  // 按最近修改时间倒序排列
  const sortedNotes = [...notes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  sortedNotes.forEach(note => {
    const li = createNoteCard(note);
    notesList.appendChild(li);
  });

  updateFloatingButton();
}

// 创建笔记卡片
function createNoteCard(note) {
  const li = document.createElement('li');
  li.className = 'note-item';
  li.id = `note-${note.id}`;
  li.dataset.noteId = note.id;

  const mode = modeByNoteId[note.id] || 'collapsed';
  li.classList.add(mode);

  if (activeNoteId === note.id) {
    li.classList.add('active');
  }

  if (isFullscreenByNoteId[note.id]) {
    li.classList.add('fullscreen');
  }

  if (isSelectMode) {
    li.classList.add('select-mode');
    if (selectedNotes.has(note.id)) {
      li.classList.add('selected');
    }
  }

  const preview = getPreview(note.content);
  const displayDate = settings.dateDisplay === 'createdAt' ? note.createdAt : note.updatedAt;

  // 操作按钮
  const actionsHtml = mode === 'editing'
    ? `
      <button data-action="fullscreen" title="全屏">${isFullscreenByNoteId[note.id]
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="m14 10 7-7"/><path d="M3 21l7-7"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`
      }</button>
      <button data-action="exit" title="返回"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg></button>
    `
    : `
      <button data-action="toggle" title="展开/收起">${mode === 'expanded'
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`
      }</button>
      <button data-action="edit" title="编辑"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>
      <button data-action="delete" title="删除"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg></button>
    `;

  li.innerHTML = `
    <div class="card-actions">${actionsHtml}</div>
    <div class="note-checkbox"></div>

    <div class="note-content-wrapper">
      <div class="note-date">${formatDate(displayDate)}</div>

      ${mode === 'collapsed' ? `
        <div class="note-preview">${escapeHtml(preview)}</div>
      ` : ''}

      ${mode === 'expanded' ? `
        <div class="note-read-layer">${formatContent(note.content)}</div>
      ` : ''}
    </div>

    ${mode === 'editing' ? `
      <div class="note-edit-layer">
        <div class="note-date">${formatDate(displayDate)}</div>
        <div class="edit-toolbar">
          <button class="toolbar-btn" data-command="h1" title="标题 1">H1</button>
          <button class="toolbar-btn" data-command="h2" title="标题 2">H2</button>
          <button class="toolbar-btn" data-command="h3" title="标题 3">H3</button>
          <button class="toolbar-btn" data-command="bold" title="粗体">B</button>
          <button class="toolbar-btn" data-command="italic" title="斜体">I</button>
          <button class="toolbar-btn" data-command="strikethrough" title="删除线">S</button>
          <button class="toolbar-btn" data-command="ul" title="无序列表">•</button>
          <button class="toolbar-btn" data-command="ol" title="有序列表">1.</button>
          <button class="toolbar-btn" data-command="code" title="代码">&lt;/&gt;</button>
        </div>
        <textarea class="note-editor" data-note-id="${note.id}">${escapeHtml(note.content || '')}</textarea>
      </div>
    ` : ''}
  `;

  // 事件监听 - 卡片操作按钮
  li.querySelectorAll('.card-actions button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      switch (action) {
        case 'toggle':
          toggleExpand(note.id);
          break;
        case 'edit':
          enterEditing(note.id);
          break;
        case 'delete':
          deleteNote(note.id);
          break;
        case 'fullscreen':
          toggleFullscreen(note.id);
          break;
        case 'exit':
          exitEditing(note.id);
          break;
      }
    });
  });

  // 事件监听 - 内容区域点击
  const contentWrapper = li.querySelector('.note-content-wrapper');
  if (contentWrapper) {
    contentWrapper.addEventListener('click', () => {
      handleContentClick(note.id);
    });
  }

  // 事件监听 - 工具栏按钮
  li.querySelectorAll('.toolbar-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const command = btn.getAttribute('data-command');
      executeCommand(note.id, command);
    });
  });

  // 设置高度
  setTimeout(() => {
    updateCardHeight(li, note.id);
  }, 0);

  // 编辑器自动保存
  if (mode === 'editing') {
    const editor = li.querySelector('.note-editor');
    let saveTimeout;
    editor.addEventListener('input', () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        autoSaveNote(note.id, editor.value);
      }, 500);
    });
  }

  return li;
}

// PLACEHOLDER_FOR_MORE_FUNCTIONS_2

// 更新卡片高度
function updateCardHeight(card, noteId) {
  const mode = modeByNoteId[noteId];
  const isFullscreen = isFullscreenByNoteId[noteId];

  if (isFullscreen) {
    return; // 全屏由 CSS 控制
  }

  const notesList = document.getElementById('notesList');
  const listHeight = notesList.clientHeight;

  if (mode === 'collapsed') {
    card.style.height = 'auto';
  } else if (mode === 'expanded') {
    // 展开阅读：显示完整内容
    card.style.height = 'auto';
    setTimeout(() => {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
  } else if (mode === 'editing') {
    // 编辑模式：占据 90% 视口高度
    const editHeight = listHeight * 0.9;
    card.style.height = editHeight + 'px';
    setTimeout(() => {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
  }
}

// 点击内容区域
function handleContentClick(noteId) {
  if (isSelectMode) {
    toggleNoteSelection(noteId);
    return;
  }

  const mode = modeByNoteId[noteId];
  if (mode !== 'editing') {
    toggleExpand(noteId);
  }
}

// 切换展开/收起
function toggleExpand(noteId) {
  const mode = modeByNoteId[noteId];

  if (mode === 'collapsed') {
    // 收起其他
    if (activeNoteId && activeNoteId !== noteId) {
      collapseNote(activeNoteId);
    }
    // 展开当前
    modeByNoteId[noteId] = 'expanded';
    activeNoteId = noteId;
  } else if (mode === 'expanded') {
    // 收起
    modeByNoteId[noteId] = 'collapsed';
    activeNoteId = null;
  }

  loadNotesList();
}

// 进入编辑
function enterEditing(noteId) {
  // 收起其他
  if (activeNoteId && activeNoteId !== noteId) {
    collapseNote(activeNoteId);
  }

  modeByNoteId[noteId] = 'editing';
  isFullscreenByNoteId[noteId] = false;
  activeNoteId = noteId;
  loadNotesList();
}

// 退出编辑
async function exitEditing(noteId) {
  const card = document.getElementById(`note-${noteId}`);
  const editor = card ? card.querySelector('.note-editor') : null;
  const content = editor ? editor.value.trim() : '';

  // 如果内容为空，删除笔记
  if (!content) {
    const notes = await getNotes();
    const filtered = notes.filter(n => n.id !== noteId);
    await saveNotes(filtered);
    delete modeByNoteId[noteId];
    delete isFullscreenByNoteId[noteId];
    activeNoteId = null;
  } else {
    // 保存内容
    await autoSaveNote(noteId, content);
    modeByNoteId[noteId] = 'expanded';
    isFullscreenByNoteId[noteId] = false;
  }

  loadNotesList();
}

// 切换全屏
function toggleFullscreen(noteId) {
  isFullscreenByNoteId[noteId] = !isFullscreenByNoteId[noteId];
  loadNotesList();
}

// 收起笔记
function collapseNote(noteId) {
  modeByNoteId[noteId] = 'collapsed';
  isFullscreenByNoteId[noteId] = false;
}

// 收起当前激活的笔记
function collapseActiveNote() {
  if (activeNoteId) {
    collapseNote(activeNoteId);
    activeNoteId = null;
    loadNotesList();
  }
}

// 更新浮动收起按钮
function updateFloatingButton() {
  const btn = document.getElementById('floatingCollapseBtn');
  if (activeNoteId && modeByNoteId[activeNoteId] === 'expanded') {
    btn.classList.add('visible');
  } else {
    btn.classList.remove('visible');
  }
}

// 自动保存笔记
async function autoSaveNote(noteId, content) {
  const notes = await getNotes();
  const noteIndex = notes.findIndex(n => n.id === noteId);

  if (noteIndex !== -1) {
    notes[noteIndex].content = content;
    notes[noteIndex].updatedAt = new Date().toISOString();
    await saveNotes(notes);
  }
}

// 执行编辑命令
function executeCommand(noteId, command) {
  const card = document.getElementById(`note-${noteId}`);
  const editor = card.querySelector('.note-editor');
  if (!editor) return;

  editor.focus();

  switch (command) {
    case 'h1':
    case 'h2':
    case 'h3':
      wrapSelectedText(editor, `${command === 'h1' ? '#' : command === 'h2' ? '##' : '###'} `, '');
      break;
    case 'bold':
      wrapSelectedText(editor, '**', '**');
      break;
    case 'italic':
      wrapSelectedText(editor, '*', '*');
      break;
    case 'strikethrough':
      wrapSelectedText(editor, '~~', '~~');
      break;
    case 'code':
      wrapSelectedText(editor, '`', '`');
      break;
    case 'ul':
      wrapSelectedText(editor, '- ', '');
      break;
    case 'ol':
      wrapSelectedText(editor, '1. ', '');
      break;
  }

  // 触发保存
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

// 包裹选中文本
function wrapSelectedText(textarea, before, after) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = textarea.value.substring(start, end);
  const newText = before + selectedText + after;

  textarea.value = textarea.value.substring(0, start) + newText + textarea.value.substring(end);

  // 设置新的光标位置
  const newCursorPos = start + before.length + selectedText.length;
  textarea.setSelectionRange(newCursorPos, newCursorPos);
}

// PLACEHOLDER_FOR_MORE_FUNCTIONS_3

// 创建新笔记
async function createNewNote() {
  const notes = await getNotes();
  const now = new Date().toISOString();

  const newNote = {
    id: Date.now().toString(),
    title: now.split('T')[0],
    content: '',
    createdAt: now,
    updatedAt: now
  };

  notes.unshift(newNote);
  await saveNotes(notes);

  // 初始化状态
  modeByNoteId[newNote.id] = 'editing';
  isFullscreenByNoteId[newNote.id] = false;

  // 收起其他
  if (activeNoteId) {
    collapseNote(activeNoteId);
  }

  activeNoteId = newNote.id;
  await loadNotesList();
}

// 删除笔记
async function deleteNote(noteId) {
  if (!confirm('确定要删除这个笔记吗？')) return;

  const notes = await getNotes();
  const filtered = notes.filter(n => n.id !== noteId);
  await saveNotes(filtered);

  // 清理状态
  delete modeByNoteId[noteId];
  delete isFullscreenByNoteId[noteId];
  selectedNotes.delete(noteId);

  if (activeNoteId === noteId) {
    activeNoteId = null;
  }

  const noteCard = document.querySelector(`.note-item[data-note-id="${noteId}"]`);
  if (noteCard) {
    noteCard.style.maxHeight = `${noteCard.scrollHeight}px`;
    void noteCard.offsetHeight; // 强制回流，确保动画生效
    noteCard.classList.add('removing');
    noteCard.style.maxHeight = '0px';
    setTimeout(() => {
      noteCard.remove();
    }, 240);
  }

  updateSelectedCount();
}

// 工具函数
function getPreview(content) {
  if (!content) return '空笔记';
  return content.substring(0, 100) + (content.length > 100 ? '...' : '');
}

function formatContent(content) {
  if (!content) return '<p>空笔记</p>';
  return MarkdownConverter.markdownToHtml(content);
}

function formatDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 搜索功能
function toggleSearch() {
  const searchContainer = document.getElementById('searchContainer');
  const searchBox = document.getElementById('searchBox');
  const isVisible = searchContainer.classList.contains('active');

  if (isVisible) {
    closeSearch();
  } else {
    searchContainer.classList.add('active');
    searchBox.focus();
  }
}

function closeSearch() {
  const searchContainer = document.getElementById('searchContainer');
  const searchBox = document.getElementById('searchBox');
  searchContainer.classList.remove('active');
  searchBox.value = '';
  loadNotesList();
}

async function handleSearch() {
  const searchBox = document.getElementById('searchBox');
  const keyword = searchBox.value.trim().toLowerCase();

  if (!keyword) {
    await loadNotesList();
    return;
  }

  const notes = await getNotes();
  const filteredNotes = notes.filter(note => {
    const content = note.content.toLowerCase();
    return content.includes(keyword);
  });

  renderNotesList(filteredNotes);
}

// 多选功能
async function toggleSelectMode() {
  isSelectMode = !isSelectMode;
  const btnSelect = document.getElementById('btnSelect');
  const bottomActions = document.getElementById('bottomActions');
  const notesList = document.getElementById('notesList');

  if (isSelectMode) {
    btnSelect.classList.add('active');
    bottomActions.classList.add('active');
    notesList.classList.add('has-bottom-actions');
  } else {
    btnSelect.classList.remove('active');
    bottomActions.classList.remove('active');
    notesList.classList.remove('has-bottom-actions');
    selectedNotes.clear();
  }

  await loadNotesList();
  updateSelectedCount();
}

function toggleNoteSelection(noteId) {
  const card = document.getElementById(`note-${noteId}`);
  if (selectedNotes.has(noteId)) {
    selectedNotes.delete(noteId);
    card.classList.remove('selected');
  } else {
    selectedNotes.add(noteId);
    card.classList.add('selected');
  }
  updateSelectedCount();
}

function updateSelectedCount() {
  const countEl = document.getElementById('selectedCount');
  countEl.textContent = `已选择 ${selectedNotes.size} 项`;
}

async function copySelectedNotes() {
  if (selectedNotes.size === 0) {
    alert('请先选择笔记');
    return;
  }

  const notes = await getNotes();
  const selectedContent = notes
    .filter(n => selectedNotes.has(n.id))
    .map(n => n.content)
    .join('\n\n---\n\n');

  try {
    await navigator.clipboard.writeText(selectedContent);
    alert(`已复制 ${selectedNotes.size} 条笔记`);
  } catch (err) {
    alert('复制失败');
  }
}

async function deleteSelectedNotes() {
  if (selectedNotes.size === 0) {
    alert('请先选择笔记');
    return;
  }

  if (!confirm(`确定要删除选中的 ${selectedNotes.size} 条笔记吗？`)) return;

  const notes = await getNotes();
  const filtered = notes.filter(n => !selectedNotes.has(n.id));
  await saveNotes(filtered);

  selectedNotes.clear();
  await loadNotesList();
  updateSelectedCount();
}

// 设置功能
function openSettings() {
  document.getElementById('settingsPanel').classList.add('active');
}

function closeSettings() {
  document.getElementById('settingsPanel').classList.remove('active');
}

// 初始化
initApp();
