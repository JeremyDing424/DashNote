// Chrome Note 侧边栏应用 - 重构版
const STORAGE_KEY = 'dashnote_list';
const SETTINGS_KEY = 'dashnote_settings';
const ONE_MB = 1024 * 1024;
const LOCAL_STORAGE_FALLBACK_QUOTA_BYTES = 10 * ONE_MB;
const STORAGE_USAGE_WARNING_THRESHOLD = 80;
const TEMP_STORAGE_KEY_PATTERN = /^dashnote_(tmp|temp|cache|draft|session|backup)(_|$)/i;
const DEFAULT_SETTINGS = {
  dateDisplay: 'updatedAt',
  sortOrder: 'desc',
  language: 'en'
};

const i18n = {
  en: {
    settingsTitle: 'Settings',
    dateDisplayLabel: 'Date Display',
    updatedAtOption: 'Last Modified',
    createdAtOption: 'Created Date',
    sortOrderLabel: 'Sort Order',
    sortDescOption: 'Newest First',
    sortAscOption: 'Oldest First',
    languageLabel: 'Language',
    newNoteTitle: 'New Note',
    downloadSelected: 'Download',
    searchPlaceholder: 'Search notes...',
    emptyStateText: 'No notes yet. Click the button below to create one.',
    emptyNewNoteButton: 'New Note',
    storageLabel: 'Local Sync Storage',
    storageOptimize: 'OPTIMIZE',
    storageCleaning: 'CLEANING...',
    storageTitleNotes: 'Notes',
    storageTitleSettings: 'Settings',
    storageTitleOther: 'Other',
    storageRemaining: 'Remaining',
    timeJustNow: 'Just now',
    timeMinutesAgo: '{count} min ago',
    timeHoursAgo: '{count} hr ago',
    timeDaysAgo: '{count} d ago'
  },
  zh: {
    settingsTitle: '设置',
    dateDisplayLabel: '时间显示',
    updatedAtOption: '显示最近修改时间',
    createdAtOption: '显示文件创建时间',
    sortOrderLabel: '排序方式',
    sortDescOption: '最新排最前',
    sortAscOption: '最旧排最前',
    languageLabel: 'Language / 语言',
    newNoteTitle: '新建笔记',
    downloadSelected: '下载',
    searchPlaceholder: '搜索笔记...',
    emptyStateText: '还没有笔记，点击下方按钮开始创建',
    emptyNewNoteButton: '新建笔记',
    storageLabel: '本地同步存储',
    storageOptimize: '优化',
    storageCleaning: '清理中...',
    storageTitleNotes: '笔记',
    storageTitleSettings: '设置',
    storageTitleOther: '其他',
    storageRemaining: '剩余',
    timeJustNow: '刚刚',
    timeMinutesAgo: '{count} 分钟前',
    timeHoursAgo: '{count} 小时前',
    timeDaysAgo: '{count} 天前'
  }
};

// 状态管理
let activeNoteId = null;
let modeByNoteId = {}; // 'collapsed' | 'expanded' | 'editing'
let isFullscreenByNoteId = {};
let isSelectMode = false;
let selectedNotes = new Set();
let currentDownloadNoteId = null;
let settings = { ...DEFAULT_SETTINGS };
const deleteTimers = new Map();
let storageListenerBound = false;

// 初始化应用
async function initApp() {
  setupEventListeners();
  bindStorageChangeListener();
  await updateStorageIndicator();
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
  document.getElementById('btnSelectAll').addEventListener('click', toggleSelectAll);
  document.getElementById('btnCopySelected').addEventListener('click', copySelectedNotes);
  document.getElementById('btnDownloadSelected').addEventListener('click', (event) => {
    event.stopPropagation();
    showDownloadMenu(null, event.currentTarget);
  });
  document.getElementById('btnDeleteSelected').addEventListener('click', deleteSelectedNotes);
  document.getElementById('btnSettings').addEventListener('click', openSettings);
  document.getElementById('btnCloseSettings').addEventListener('click', closeSettings);
  document.getElementById('floatingCollapseBtn').addEventListener('click', collapseActiveNote);
  document.getElementById('downloadMenu').addEventListener('click', async (event) => {
    const item = event.target.closest('.download-menu-item');
    if (!item) return;
    const format = item.getAttribute('data-format');
    if (!format) return;

    if (currentDownloadNoteId === null) {
      await downloadSelectedNotes(format);
    } else {
      await downloadSingleNote(currentDownloadNoteId, format);
    }
    hideDownloadMenu();
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('#downloadMenu')) return;
    if (event.target.closest('[data-action="download"]')) return;
    if (event.target.closest('#btnDownloadSelected')) return;
    hideDownloadMenu();
  });

  const btnOptimizeStorage = document.getElementById('btnOptimizeStorage');
  if (btnOptimizeStorage) {
    btnOptimizeStorage.addEventListener('click', optimizeStorageUsage);
  }

  // 设置选项点击（事件委托）
  const settingsContent = document.querySelector('.settings-content');
  settingsContent.addEventListener('click', (event) => {
    const option = event.target.closest('.radio-option');
    if (!option) return;

    const settingKey = option.getAttribute('data-setting');
    const value = option.getAttribute('data-value');
    if (!settingKey || !value) return;

    updateRadioSelection(settingKey, value);

    if (settingKey === 'dateDisplay') {
      updateDateDisplaySetting(value);
    } else if (settingKey === 'sortOrder') {
      updateSortOrderSetting(value);
    } else if (settingKey === 'language') {
      updateLanguageSetting(value);
    }
  });
}

function bindStorageChangeListener() {
  if (storageListenerBound || !chrome.storage?.onChanged) return;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes) return;
    updateStorageIndicator();
  });
  storageListenerBound = true;
}

// 存储操作
async function getNotes() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

async function saveNotes(notes) {
  await chrome.storage.local.set({ [STORAGE_KEY]: notes });
}

async function getStorageStats() {
  const [usedBytes, notesBytes, settingsBytes] = await Promise.all([
    chrome.storage.local.getBytesInUse(null),
    chrome.storage.local.getBytesInUse(STORAGE_KEY),
    chrome.storage.local.getBytesInUse(SETTINGS_KEY)
  ]);
  const totalBytes = typeof chrome.storage?.local?.QUOTA_BYTES === 'number'
    ? chrome.storage.local.QUOTA_BYTES
    : LOCAL_STORAGE_FALLBACK_QUOTA_BYTES;
  const otherBytes = Math.max(usedBytes - notesBytes - settingsBytes, 0);
  const percentage = totalBytes > 0
    ? Math.min(Math.max((usedBytes / totalBytes) * 100, 0), 100)
    : 0;

  return {
    usedBytes,
    totalBytes,
    percentage,
    breakdown: {
      notesBytes,
      settingsBytes,
      otherBytes
    }
  };
}

function formatMb(bytes) {
  return `${(bytes / ONE_MB).toFixed(2)} MB`;
}

function formatBytesCompact(bytes) {
  if (bytes >= ONE_MB) {
    return `${(bytes / ONE_MB).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function getCurrentLocale() {
  return i18n[settings.language] || i18n.en;
}

function formatI18nCount(template, count) {
  return template.replace('{count}', count);
}

async function updateStorageIndicator() {
  const percentEl = document.getElementById('storagePercentText');
  const progressFillEl = document.getElementById('storageProgressFill');
  const usedValueEl = document.getElementById('storageUsedValue');
  const totalValueEl = document.getElementById('storageTotalValue');
  const storageCard = document.getElementById('storageCard');

  if (!percentEl || !progressFillEl || !usedValueEl || !totalValueEl || !storageCard) {
    return;
  }

  try {
    const locale = getCurrentLocale();
    const { usedBytes, totalBytes, percentage, breakdown } = await getStorageStats();
    const roundedPercent = Math.round(percentage);
    const remainingBytes = Math.max(totalBytes - usedBytes, 0);

    percentEl.textContent = `${roundedPercent}%`;
    progressFillEl.style.width = `${percentage.toFixed(2)}%`;
    usedValueEl.textContent = formatMb(usedBytes);
    totalValueEl.textContent = `${locale.storageRemaining} ${formatMb(remainingBytes)}`;
    storageCard.classList.toggle('near-limit', percentage >= STORAGE_USAGE_WARNING_THRESHOLD);
    storageCard.title = `${locale.storageTitleNotes} ${formatMb(breakdown.notesBytes)} | ${locale.storageTitleSettings} ${formatMb(breakdown.settingsBytes)} | ${locale.storageTitleOther} ${formatMb(breakdown.otherBytes)}`;
  } catch (error) {
    console.warn('Failed to update storage indicator:', error);
  }
}

function removeInvalidStateForNotes(validNoteIds) {
  Object.keys(modeByNoteId).forEach(noteId => {
    if (!validNoteIds.has(noteId)) {
      delete modeByNoteId[noteId];
    }
  });

  Object.keys(isFullscreenByNoteId).forEach(noteId => {
    if (!validNoteIds.has(noteId)) {
      delete isFullscreenByNoteId[noteId];
    }
  });

  selectedNotes.forEach(noteId => {
    if (!validNoteIds.has(noteId)) {
      selectedNotes.delete(noteId);
    }
  });

  if (activeNoteId && !validNoteIds.has(activeNoteId)) {
    activeNoteId = null;
    document.getElementById('btnNew').disabled = false;
  }
}

async function optimizeStorageUsage() {
  const btnOptimizeStorage = document.getElementById('btnOptimizeStorage');
  if (!btnOptimizeStorage) return;

  const locale = i18n[settings.language] || i18n.en;
  btnOptimizeStorage.textContent = locale.storageCleaning;
  btnOptimizeStorage.disabled = true;

  try {
    const beforeStats = await getStorageStats();
    const data = await chrome.storage.local.get(null);
    const notes = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
    const now = Date.now();

    const compactedNotes = notes.filter(note => {
      if (!note || typeof note !== 'object') return false;
      return typeof note.content === 'string' && note.content.trim().length > 0;
    });
    const notesChanged = compactedNotes.length !== notes.length;

    const keysToRemove = new Set();
    Object.entries(data).forEach(([key, value]) => {
      if (key === STORAGE_KEY || key === SETTINGS_KEY) return;

      if (!key.startsWith('dashnote_')) return;

      if (TEMP_STORAGE_KEY_PATTERN.test(key)) {
        keysToRemove.add(key);
        return;
      }

      const expiresAt = value && typeof value === 'object' ? value.expiresAt : null;
      if (expiresAt) {
        const expiresAtMs = new Date(expiresAt).getTime();
        if (!Number.isNaN(expiresAtMs) && expiresAtMs <= now) {
          keysToRemove.add(key);
        }
      }
    });

    if (notesChanged) {
      await saveNotes(compactedNotes);
      const validNoteIds = new Set(compactedNotes.map(note => note.id));
      removeInvalidStateForNotes(validNoteIds);
      await loadNotesList();
      updateSelectedCount();
    }

    const removableKeys = Array.from(keysToRemove);
    if (removableKeys.length > 0) {
      await chrome.storage.local.remove(removableKeys);
    }

    await updateStorageIndicator();

    const afterStats = await getStorageStats();
    const reclaimedBytes = Math.max(beforeStats.usedBytes - afterStats.usedBytes, 0);
    const cleanedCount = (notes.length - compactedNotes.length) + removableKeys.length;
    if (cleanedCount > 0) {
      showToast(`Optimized ${cleanedCount} items, freed ${formatBytesCompact(reclaimedBytes)}`);
    } else {
      showToast('No cleanup needed');
    }

    if (afterStats.breakdown.otherBytes > 0) {
      console.info(
        `Storage includes non-note keys: ${formatBytesCompact(afterStats.breakdown.otherBytes)} under chrome.storage.local`
      );
    }
  } catch (error) {
    console.error('Failed to optimize storage usage:', error);
    showToast('Optimize failed');
  } finally {
    const finalLocale = i18n[settings.language] || i18n.en;
    btnOptimizeStorage.textContent = finalLocale.storageOptimize;
    btnOptimizeStorage.disabled = false;
  }
}

// 加载设置
async function loadSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  settings = { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };

  updateRadioSelection('dateDisplay', settings.dateDisplay);
  updateRadioSelection('sortOrder', settings.sortOrder);
  updateRadioSelection('language', settings.language);
  applyLanguage(settings.language);
}

// 保存设置
async function saveSettings() {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

// 更新日期显示设置
async function updateDateDisplaySetting(value) {
  if (settings.dateDisplay === value) return;
  settings.dateDisplay = value;
  await saveSettings();

  // 重新渲染列表
  await loadNotesList();
}

// PLACEHOLDER_FOR_MORE_FUNCTIONS

async function updateSortOrderSetting(value) {
  if (settings.sortOrder === value) return;
  settings.sortOrder = value;
  await saveSettings();
  await loadNotesList();
}

async function updateLanguageSetting(value) {
  if (settings.language === value) return;
  settings.language = value;
  await saveSettings();
  applyLanguage(value);
  await loadNotesList();
}

function updateRadioSelection(settingKey, value) {
  document.querySelectorAll(`.radio-option[data-setting="${settingKey}"]`).forEach(option => {
    if (option.getAttribute('data-value') === value) {
      option.classList.add('selected');
    } else {
      option.classList.remove('selected');
    }
  });
}

function applyLanguage(lang) {
  const locale = i18n[lang] || i18n.en;

  const settingsTitle = document.getElementById('settingsTitle');
  if (settingsTitle) settingsTitle.textContent = locale.settingsTitle;

  const dateDisplayLabel = document.getElementById('dateDisplayLabel');
  if (dateDisplayLabel) dateDisplayLabel.textContent = locale.dateDisplayLabel;

  const updatedAtOptionText = document.getElementById('optionTextUpdatedAt');
  if (updatedAtOptionText) updatedAtOptionText.textContent = locale.updatedAtOption;

  const createdAtOptionText = document.getElementById('optionTextCreatedAt');
  if (createdAtOptionText) createdAtOptionText.textContent = locale.createdAtOption;

  const sortOrderLabel = document.getElementById('sortOrderLabel');
  if (sortOrderLabel) sortOrderLabel.textContent = locale.sortOrderLabel;

  const sortDescOptionText = document.getElementById('optionTextSortDesc');
  if (sortDescOptionText) sortDescOptionText.textContent = locale.sortDescOption;

  const sortAscOptionText = document.getElementById('optionTextSortAsc');
  if (sortAscOptionText) sortAscOptionText.textContent = locale.sortAscOption;

  const languageLabel = document.getElementById('languageLabel');
  if (languageLabel) languageLabel.textContent = locale.languageLabel;

  const btnNew = document.getElementById('btnNew');
  if (btnNew) btnNew.title = locale.newNoteTitle;

  const searchBox = document.getElementById('searchBox');
  if (searchBox) searchBox.placeholder = locale.searchPlaceholder;

  const emptyText = document.querySelector('.empty-text');
  if (emptyText) emptyText.textContent = locale.emptyStateText;

  const emptyNewNoteButtonText = document.querySelector('#btnNewEmpty span:last-child');
  if (emptyNewNoteButtonText) emptyNewNoteButtonText.textContent = locale.emptyNewNoteButton;

  const btnDownloadSelected = document.getElementById('btnDownloadSelected');
  if (btnDownloadSelected) btnDownloadSelected.textContent = locale.downloadSelected;

  const storageLabelText = document.getElementById('storageLabelText');
  if (storageLabelText) storageLabelText.textContent = locale.storageLabel;

  const btnOptimizeStorage = document.getElementById('btnOptimizeStorage');
  if (btnOptimizeStorage) {
    btnOptimizeStorage.textContent = btnOptimizeStorage.disabled
      ? locale.storageCleaning
      : locale.storageOptimize;
  }

  void updateStorageIndicator();
}

function sortNotesBySettings(notes) {
  const sortField = settings.dateDisplay === 'createdAt' ? 'createdAt' : 'updatedAt';
  const direction = settings.sortOrder === 'asc' ? 1 : -1;

  return [...notes].sort((a, b) => {
    const timeA = new Date(a[sortField] || 0).getTime();
    const timeB = new Date(b[sortField] || 0).getTime();
    return (timeA - timeB) * direction;
  });
}

// 加载笔记列表
async function loadNotesList() {
  const notes = await getNotes();
  const sortedNotes = sortNotesBySettings(notes);
  normalizeActiveNote(notes);
  renderNotesList(sortedNotes);
}

// 清理无效激活状态：active 仅允许用于展开/编辑中的笔记
function normalizeActiveNote(notes) {
  if (!activeNoteId) return;

  const activeNoteExists = notes.some(note => note.id === activeNoteId);
  if (!activeNoteExists) {
    activeNoteId = null;
    return;
  }

  const activeMode = modeByNoteId[activeNoteId] || 'collapsed';
  if (activeMode === 'collapsed') {
    activeNoteId = null;
  }
}

// 渲染笔记列表
function renderNotesList(notes) {
  const notesList = document.getElementById('notesList');
  notesList.innerHTML = '';
  const locale = i18n[settings.language] || i18n.en;

  if (notes.length === 0) {
    notesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <div class="empty-text">${escapeHtml(locale.emptyStateText)}</div>
        <button class="btn-new-large" id="btnNewEmpty">
          <span>+</span>
          <span>${escapeHtml(locale.emptyNewNoteButton)}</span>
        </button>
      </div>
    `;
    document.getElementById('btnNewEmpty').addEventListener('click', createNewNote);
    return;
  }

  notes.forEach(note => {
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

  if (activeNoteId === note.id && mode !== 'collapsed') {
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
      <button data-action="copy" title="复制"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>
      <button data-action="download" title="下载"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg></button>
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
        case 'copy':
          copySingleNote(note.id);
          break;
        case 'download':
          showDownloadMenu(note.id, btn);
          break;
        case 'edit':
          enterEditing(note.id);
          break;
        case 'delete':
          handleCardDeleteClick(note.id, btn);
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

  // 事件监听 - 选择框点击
  const noteCheckbox = li.querySelector('.note-checkbox');
  if (noteCheckbox) {
    noteCheckbox.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isSelectMode) return;
      toggleNoteSelection(note.id);
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
  document.getElementById('btnNew').disabled = true;
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
    document.getElementById('btnNew').disabled = false;
  } else {
    // 保存内容
    await autoSaveNote(noteId, content);
    modeByNoteId[noteId] = 'expanded';
    document.getElementById('btnNew').disabled = false;
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
  document.getElementById('btnNew').disabled = false;
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
  if (!btn) return;

  // 显示逻辑仅由模式状态决定，不受内容高度影响
  const isActiveExpanded = Boolean(
    activeNoteId && modeByNoteId[activeNoteId] === 'expanded'
  );
  const hasAnyExpanded = Object.values(modeByNoteId).some(mode => mode === 'expanded');

  btn.classList.toggle('visible', isActiveExpanded || hasAnyExpanded);
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
  if (activeNoteId && modeByNoteId[activeNoteId] === 'editing') {
    const editor = document.querySelector('#note-' + activeNoteId + ' .note-editor');
    if (editor) editor.focus();
    return;
  }

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
  document.getElementById('btnNew').disabled = true;
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
  clearDeleteTimer(`note:${noteId}`);

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
  const locale = getCurrentLocale();
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return locale.timeJustNow;
  if (diffMins < 60) return formatI18nCount(locale.timeMinutesAgo, diffMins);
  if (diffHours < 24) return formatI18nCount(locale.timeHoursAgo, diffHours);
  if (diffDays < 7) return formatI18nCount(locale.timeDaysAgo, diffDays);

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

  renderNotesList(sortNotesBySettings(filteredNotes));
}

// 多选功能
async function toggleSelectMode() {
  isSelectMode = !isSelectMode;
  const btnSelect = document.getElementById('btnSelect');
  const bottomActions = document.getElementById('bottomActions');
  const notesList = document.getElementById('notesList');
  const storageIndicatorWrap = document.getElementById('storageIndicatorWrap');

  if (isSelectMode) {
    btnSelect.classList.add('active');
    bottomActions.classList.add('active');
    notesList.classList.add('has-bottom-actions');
    storageIndicatorWrap?.classList.add('with-bottom-actions');
  } else {
    btnSelect.classList.remove('active');
    bottomActions.classList.remove('active');
    notesList.classList.remove('has-bottom-actions');
    storageIndicatorWrap?.classList.remove('with-bottom-actions');
    selectedNotes.clear();
    document.getElementById('btnSelectAll').textContent = '全选';
    resetSelectedDeleteConfirm();
    hideDownloadMenu();
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

  // 同步全选按钮文字
  const allCards = document.querySelectorAll('.note-item.select-mode');
  const btnSelectAll = document.getElementById('btnSelectAll');
  if (allCards.length > 0 && selectedNotes.size >= allCards.length) {
    btnSelectAll.textContent = '取消全选';
  } else {
    btnSelectAll.textContent = '全选';
  }
}

function toggleSelectAll() {
  const allCards = document.querySelectorAll('.note-item.select-mode');
  const isAllSelected = selectedNotes.size >= allCards.length && allCards.length > 0;

  allCards.forEach(card => {
    const noteId = card.id.replace('note-', '');
    if (isAllSelected) {
      selectedNotes.delete(noteId);
      card.classList.remove('selected');
    } else {
      selectedNotes.add(noteId);
      card.classList.add('selected');
    }
  });

  updateSelectedCount();
}

function showToast(message) {
  const toast = document.getElementById('copyToast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1500);
}

async function copySingleNote(noteId) {
  const notes = await getNotes();
  const note = notes.find(n => n.id === noteId);
  if (!note) return;
  try {
    await navigator.clipboard.writeText(note.content);
    showToast('Copied!');
  } catch (err) {
    alert('复制失败');
  }
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
    showToast(`Copied ${selectedNotes.size} notes`);
    await toggleSelectMode();
  } catch (err) {
    alert('复制失败');
  }
}

function showDownloadMenu(noteId, anchorEl) {
  const menu = document.getElementById('downloadMenu');
  if (!menu || !anchorEl) return;

  currentDownloadNoteId = noteId;

  const rect = anchorEl.getBoundingClientRect();
  const menuWidth = menu.offsetWidth || 160;
  const maxLeft = window.innerWidth - menuWidth - 8;
  const left = Math.max(8, Math.min(rect.left, maxLeft));
  const top = Math.min(rect.bottom + 6, window.innerHeight - 90);

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.classList.add('active');
}

function hideDownloadMenu() {
  const menu = document.getElementById('downloadMenu');
  if (!menu) return;
  menu.classList.remove('active');
  currentDownloadNoteId = null;
}

function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadSingleNote(noteId, format) {
  const notes = await getNotes();
  const note = notes.find(n => n.id === noteId);
  if (!note) return;

  const extension = format === 'txt' ? 'txt' : 'md';
  const content = extension === 'txt' ? stripMarkdown(note.content || '') : (note.content || '');
  const filename = `note-${note.id}.${extension}`;
  triggerDownload(content, filename);
}

async function downloadSelectedNotes(format) {
  if (selectedNotes.size === 0) {
    alert('请先选择笔记');
    return;
  }

  const extension = format === 'txt' ? 'txt' : 'md';
  const notes = await getNotes();
  const selectedList = notes.filter(n => selectedNotes.has(n.id));

  const content = selectedList.map((note, index) => {
    const body = extension === 'txt' ? stripMarkdown(note.content || '') : (note.content || '');
    if (extension === 'txt') {
      return `Note ${index + 1}\n${body}`;
    }
    return `## Note ${index + 1}\n\n${body}`;
  }).join(extension === 'txt' ? '\n\n--------------------\n\n' : '\n\n---\n\n');

  const filename = `dashnote-selected-${Date.now()}.${extension}`;
  triggerDownload(content, filename);
}

async function deleteSelectedNotes() {
  const btnDeleteSelected = document.getElementById('btnDeleteSelected');
  if (selectedNotes.size === 0) {
    resetSelectedDeleteConfirm();
    alert('请先选择笔记');
    return;
  }

  if (!btnDeleteSelected.classList.contains('confirm-delete')) {
    btnDeleteSelected.classList.add('confirm-delete');
    btnDeleteSelected.textContent = 'Confirm Delete';
    setDeleteTimer('selected-delete', () => {
      btnDeleteSelected.classList.remove('confirm-delete');
      btnDeleteSelected.textContent = '删除';
    });
    return;
  }

  resetSelectedDeleteConfirm();

  const notes = await getNotes();
  const filtered = notes.filter(n => !selectedNotes.has(n.id));
  await saveNotes(filtered);

  selectedNotes.clear();
  await toggleSelectMode();
}

function handleCardDeleteClick(noteId, button) {
  const timerKey = `note:${noteId}`;
  if (!button.classList.contains('confirm-delete')) {
    button.classList.add('confirm-delete');
    setDeleteTimer(timerKey, () => {
      button.classList.remove('confirm-delete');
    });
    return;
  }

  button.classList.remove('confirm-delete');
  clearDeleteTimer(timerKey);
  deleteNote(noteId);
}

function setDeleteTimer(key, onTimeout) {
  clearDeleteTimer(key);
  const timer = setTimeout(() => {
    deleteTimers.delete(key);
    onTimeout();
  }, 2000);
  deleteTimers.set(key, timer);
}

function clearDeleteTimer(key) {
  const timer = deleteTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    deleteTimers.delete(key);
  }
}

function resetSelectedDeleteConfirm() {
  const btnDeleteSelected = document.getElementById('btnDeleteSelected');
  if (!btnDeleteSelected) return;
  btnDeleteSelected.classList.remove('confirm-delete');
  btnDeleteSelected.textContent = '删除';
  clearDeleteTimer('selected-delete');
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
