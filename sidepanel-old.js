// Chrome Note 侧边栏应用
const STORAGE_KEY = 'dashnote_list';
const SETTINGS_KEY = 'dashnote_settings';
let currentNoteId = null;
let isSelectMode = false;
let selectedNotes = new Set();
let settings = {
  dateDisplay: 'updatedAt' // 默认显示修改时间
};

// 初始化应用
async function initApp() {
  setupEventListeners();

  // 加载设置
  await loadSettings();

  const notes = await getNotes();

  // 首次打开（没有笔记），直接进入编辑页
  if (notes.length === 0) {
    await createNewNote();
  } else {
    // 有笔记，显示列表页
    await loadNotesList();
  }
}

// 设置事件监听
function setupEventListeners() {
  document.getElementById('btnNew').addEventListener('click', createNewNote);
  document.getElementById('btnBack').addEventListener('click', backToList);
  document.getElementById('btnCopy').addEventListener('click', copyToClipboard);
  document.getElementById('btnSearch').addEventListener('click', toggleSearch);
  document.getElementById('btnClearSearch').addEventListener('click', closeSearch);
  document.getElementById('searchBox').addEventListener('input', handleSearch);
  document.getElementById('btnSelect').addEventListener('click', toggleSelectMode);
  document.getElementById('btnCopySelected').addEventListener('click', copySelectedNotes);
  document.getElementById('btnDeleteSelected').addEventListener('click', deleteSelectedNotes);
  document.getElementById('btnSettings').addEventListener('click', openSettings);
  document.getElementById('btnCloseSettings').addEventListener('click', closeSettings);

  // 设置选项点击
  document.querySelectorAll('.radio-option').forEach(option => {
    option.addEventListener('click', function() {
      const value = this.getAttribute('data-value');
      updateDateDisplaySetting(value);
    });
  });
}

// 创建新笔记
async function createNewNote() {
  const noteId = Date.now().toString();
  const today = new Date();
  const dateTitle = today.toISOString().split('T')[0]; // YYYY-MM-DD 格式

  const newNote = {
    id: noteId,
    title: dateTitle,
    content: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const notes = await getNotes();
  notes.push(newNote);
  await saveNotes(notes);

  currentNoteId = noteId;
  showEditorView(newNote);
}

// 加载笔记列表
async function loadNotesList() {
  const notes = await getNotes();
  const searchBox = document.getElementById('searchBox');
  if (searchBox) {
    searchBox.value = ''; // 清空搜索框
  }
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

  // 按最近修改时间倒序排列（不修改原数组）
  const sortedNotes = [...notes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  sortedNotes.forEach(note => {
    const li = document.createElement('li');
    li.className = 'note-item';
    li.id = `note-${note.id}`;
    li.dataset.noteId = note.id;

    if (isSelectMode) {
      li.classList.add('select-mode');
      if (selectedNotes.has(note.id)) {
        li.classList.add('selected');
      }
    }

    const preview = getPreview(note.content);
    const needsExpand = needsExpandButton(note.content);

    // 根据设置显示创建时间或修改时间
    const displayDate = settings.dateDisplay === 'createdAt' ? note.createdAt : note.updatedAt;

    const toggleButtonHtml = needsExpand ? `
      <button class="btn-toggle" data-id="${note.id}" title="展开/收起">
        <span class="toggle-text">展开</span>
      </button>
    ` : '';

    li.innerHTML = `
      <div class="note-checkbox"></div>
      <div class="note-date">${formatDate(displayDate)}</div>
      <div class="note-preview" data-full-content="${escapeHtml(note.content)}">${escapeHtml(preview)}</div>
      <div class="note-editor">
        <textarea class="note-textarea" data-id="${note.id}">${escapeHtml(note.content)}</textarea>
        <div class="editor-actions">
          <div class="editor-info">自动保存</div>
          <button class="btn-editor-back" data-id="${note.id}">← 返回</button>
        </div>
      </div>
      <div class="note-meta">
        ${toggleButtonHtml}
        <button class="btn-delete-icon" data-id="${note.id}" title="删除">×</button>
      </div>
    `;

    // 点击卡片
    li.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-icon')) {
        e.stopPropagation();
        deleteNote(note.id);
      } else if (e.target.closest('.btn-toggle')) {
        e.stopPropagation();
        toggleNoteExpand(note.id, li);
      } else if (e.target.closest('.btn-editor-back')) {
        e.stopPropagation();
        exitInlineEdit(note.id, li);
      } else if (e.target.closest('.note-textarea')) {
        // 点击 textarea 不做任何操作，让用户编辑
        e.stopPropagation();
      } else if (e.target.closest('.note-preview') || e.target.closest('.note-date')) {
        // 点击预览内容或日期区域进入编辑
        if (isSelectMode) {
          toggleNoteSelection(note.id, li);
        } else {
          enterInlineEdit(note.id, li);
        }
      } else {
        // 点击其他空白区域
        if (isSelectMode) {
          toggleNoteSelection(note.id, li);
        }
      }
    });

    notesList.appendChild(li);
  });
}

// 处理搜索
async function handleSearch(e) {
  const keyword = e.target.value.trim().toLowerCase();
  const notes = await getNotes();

  if (!keyword) {
    // 搜索框为空，显示所有笔记
    renderNotesList(notes);
    return;
  }

  // 过滤包含关键字的笔记
  const filteredNotes = notes.filter(note => {
    const content = note.content.toLowerCase();
    const title = note.title.toLowerCase();
    return content.includes(keyword) || title.includes(keyword);
  });

  renderNotesList(filteredNotes);
}

// 切换搜索框显示
function toggleSearch() {
  const searchContainer = document.getElementById('searchContainer');
  const searchBtn = document.getElementById('btnSearch');
  const searchBox = document.getElementById('searchBox');

  searchContainer.classList.toggle('active');
  searchBtn.classList.toggle('active');

  if (searchContainer.classList.contains('active')) {
    // 展开后自动聚焦搜索框
    setTimeout(() => {
      searchBox.focus();
    }, 300);
  }
}

// 关闭搜索框
async function closeSearch() {
  const searchContainer = document.getElementById('searchContainer');
  const searchBtn = document.getElementById('btnSearch');
  const searchBox = document.getElementById('searchBox');

  searchContainer.classList.remove('active');
  searchBtn.classList.remove('active');
  searchBox.value = '';

  // 恢复显示所有笔记
  const notes = await getNotes();
  renderNotesList(notes);
}

// 切换多选模式
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

  // 重新渲染列表（保持当前搜索状态）
  const searchBox = document.getElementById('searchBox');
  const keyword = searchBox.value.trim().toLowerCase();

  if (keyword) {
    // 如果有搜索关键词，重新执行搜索
    const notes = await getNotes();
    const filteredNotes = notes.filter(note => {
      const content = note.content.toLowerCase();
      const title = note.title.toLowerCase();
      return content.includes(keyword) || title.includes(keyword);
    });
    renderNotesList(filteredNotes);
  } else {
    // 没有搜索，正常加载列表
    await loadNotesList();
  }
}

// 切换笔记选中状态
function toggleNoteSelection(noteId, element) {
  if (selectedNotes.has(noteId)) {
    selectedNotes.delete(noteId);
    element.classList.remove('selected');
  } else {
    selectedNotes.add(noteId);
    element.classList.add('selected');
  }

  updateSelectedCount();
}

// 更新选中数量显示
function updateSelectedCount() {
  const selectedCount = document.getElementById('selectedCount');
  selectedCount.textContent = `已选择 ${selectedNotes.size} 项`;
}

// 复制选中的笔记
async function copySelectedNotes() {
  if (selectedNotes.size === 0) {
    alert('请先选择要复制的笔记');
    return;
  }

  const notes = await getNotes();
  const selectedContents = notes
    .filter(note => selectedNotes.has(note.id))
    .map(note => note.content)
    .join('\n\n---\n\n');

  try {
    await navigator.clipboard.writeText(selectedContents);
    alert(`已复制 ${selectedNotes.size} 条笔记`);
  } catch (err) {
    console.error('复制失败:', err);
    alert('复制失败，请重试');
  }
}

// 删除选中的笔记
async function deleteSelectedNotes() {
  if (selectedNotes.size === 0) {
    alert('请先选择要删除的笔记');
    return;
  }

  if (!confirm(`确定要删除选中的 ${selectedNotes.size} 条笔记吗？`)) {
    return;
  }

  const notes = await getNotes();
  const filtered = notes.filter(note => !selectedNotes.has(note.id));
  await saveNotes(filtered);

  selectedNotes.clear();
  await loadNotesList();
}

// 进入内联编辑模式
function enterInlineEdit(noteId, element) {
  // 先关闭其他正在编辑的笔记
  const allItems = document.querySelectorAll('.note-item.editing');
  allItems.forEach(item => {
    if (item.dataset.noteId !== noteId) {
      item.classList.remove('editing');
    }
  });

  element.classList.add('editing');
  element.classList.remove('expanded');

  // 聚焦到 textarea
  const textarea = element.querySelector('.note-textarea');
  if (textarea) {
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }, 100);

    // 移除旧的监听器，避免重复绑定
    const oldHandler = textarea._autoSaveHandler;
    if (oldHandler) {
      textarea.removeEventListener('input', oldHandler);
    }

    // 添加新的自动保存监听
    const newHandler = () => autoSaveInlineNote(noteId, textarea);
    textarea._autoSaveHandler = newHandler;
    textarea.addEventListener('input', newHandler);
  }
}

// 自动保存内联编辑的笔记
async function autoSaveInlineNote(noteId, textarea) {
  const content = textarea.value;

  const notes = await getNotes();
  const noteIndex = notes.findIndex(n => n.id === noteId);

  if (noteIndex !== -1) {
    notes[noteIndex].content = content;
    notes[noteIndex].updatedAt = new Date().toISOString();
    await saveNotes(notes);
  }
}

// 退出内联编辑
async function exitInlineEdit(noteId, element) {
  element.classList.remove('editing');

  // 重新渲染列表以更新预览
  await loadNotesList();
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

// 打开设置面板
function openSettings() {
  document.getElementById('settingsPanel').classList.add('active');
  document.getElementById('btnSettings').classList.add('active');
}

// 关闭设置面板
function closeSettings() {
  document.getElementById('settingsPanel').classList.remove('active');
  document.getElementById('btnSettings').classList.remove('active');
}

// 更新时间显示设置
async function updateDateDisplaySetting(value) {
  settings.dateDisplay = value;
  await saveSettings();

  // 更新 UI 选中状态
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

// 切换笔记展开/收起
function toggleNoteExpand(noteId, element) {
  element.classList.toggle('expanded');

  const toggleBtn = element.querySelector('.btn-toggle');
  if (!toggleBtn) return; // 防止 null 错误

  const toggleText = toggleBtn.querySelector('.toggle-text');
  const notePreview = element.querySelector('.note-preview');

  if (element.classList.contains('expanded')) {
    toggleText.textContent = '收起';
    // 展开时显示完整内容
    const fullContent = notePreview.getAttribute('data-full-content');
    notePreview.textContent = fullContent;
  } else {
    toggleText.textContent = '展开';
    // 收起时恢复预览内容
    const fullContent = notePreview.getAttribute('data-full-content');
    const preview = getPreview(fullContent);
    notePreview.textContent = preview;
  }
}

// 编辑笔记
async function editNote(noteId) {
  const notes = await getNotes();
  const note = notes.find(n => n.id === noteId);
  if (note) {
    currentNoteId = noteId;
    showEditorView(note);
  }
}

// 显示编辑页
function showEditorView(note) {
  document.getElementById('listView').style.display = 'none';
  document.getElementById('editorView').style.display = 'flex';

  // 获取自定义编辑器
  const customEditor = document.getElementById('customEditor');

  // 加载内容（从 Markdown 转换为 HTML）
  if (note.content && note.content.trim()) {
    const html = MarkdownConverter.markdownToHtml(note.content);
    customEditor.innerHTML = html || '<p><br></p>';
  } else {
    customEditor.innerHTML = '<p><br></p>';
  }

  // 设置工具栏事件监听
  setupCustomToolbar();

  // 自动保存
  let saveTimeout;
  const handleInput = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      autoSaveNote();
    }, 500);
  };

  // 移除旧的监听器
  customEditor.removeEventListener('input', handleInput);
  customEditor.addEventListener('input', handleInput);

  // 聚焦编辑器
  setTimeout(() => {
    customEditor.focus();
    // 将光标移到末尾
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(customEditor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, 100);
}

// 自动保存笔记
async function autoSaveNote() {
  if (!currentNoteId) return;

  const customEditor = document.getElementById('customEditor');
  if (!customEditor) return;

  const html = customEditor.innerHTML;

  // 转换为 Markdown
  const markdown = MarkdownConverter.htmlToMarkdown(html);

  const notes = await getNotes();
  const noteIndex = notes.findIndex(n => n.id === currentNoteId);
  if (noteIndex !== -1) {
    notes[noteIndex].content = markdown;
    notes[noteIndex].updatedAt = new Date().toISOString();

    await saveNotes(notes);
    console.log('自动保存成功:', markdown.substring(0, 50));
  }
}

// 设置自定义工具栏
function setupCustomToolbar() {
  const toolbar = document.getElementById('customToolbar');
  const editor = document.getElementById('customEditor');

  // 移除旧的事件监听
  const newToolbar = toolbar.cloneNode(true);
  toolbar.parentNode.replaceChild(newToolbar, toolbar);

  // 添加按钮点击事件
  newToolbar.querySelectorAll('.toolbar-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const command = btn.getAttribute('data-command');
      executeCommand(command);
    });
  });
}

// 执行编辑命令
function executeCommand(command) {
  const editor = document.getElementById('customEditor');
  editor.focus();

  // 保存当前选区
  const selection = window.getSelection();
  const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  switch (command) {
    case 'h1':
      document.execCommand('formatBlock', false, '<h1>');
      break;
    case 'h2':
      document.execCommand('formatBlock', false, '<h2>');
      break;
    case 'h3':
      document.execCommand('formatBlock', false, '<h3>');
      break;
    case 'bold':
      document.execCommand('bold', false, null);
      break;
    case 'italic':
      document.execCommand('italic', false, null);
      break;
    case 'strikethrough':
      document.execCommand('strikeThrough', false, null);
      break;
    case 'ul':
      document.execCommand('insertUnorderedList', false, null);
      break;
    case 'ol':
      document.execCommand('insertOrderedList', false, null);
      break;
    case 'code':
      wrapSelection('code');
      break;
  }

  // 触发 input 事件以保存
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

// 包裹选中文本
function wrapSelection(tag) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const selectedText = range.toString();

  if (selectedText) {
    const wrapper = document.createElement(tag);
    wrapper.textContent = selectedText;
    range.deleteContents();
    range.insertNode(wrapper);

    // 移动光标到包裹元素后面
    range.setStartAfter(wrapper);
    range.setEndAfter(wrapper);
    selection.removeAllRanges();
    selection.addRange(range);

    // 触发 input 事件以保存
    const editor = document.getElementById('customEditor');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// 返回列表
async function backToList() {
  // 如果编辑的笔记为空且标题未修改，删除它
  if (currentNoteId) {
    const notes = await getNotes();
    const note = notes.find(n => n.id === currentNoteId);

    if (note) {
      const customEditor = document.getElementById('customEditor');
      const content = customEditor ? MarkdownConverter.htmlToMarkdown(customEditor.innerHTML).trim() : '';
      const isDefaultTitle = /^\d{4}-\d{2}-\d{2}$/.test(note.title); // 检查是否为日期格式

      // 只有当内容为空且标题是默认日期格式时才删除
      if (!content && isDefaultTitle) {
        const filtered = notes.filter(n => n.id !== currentNoteId);
        await saveNotes(filtered);
      }
    }
  }

  document.getElementById('editorView').style.display = 'none';
  document.getElementById('listView').style.display = 'flex';
  currentNoteId = null;
  await loadNotesList();
}

// 删除笔记
async function deleteNote(noteId) {
  if (!confirm('确定要删除这个笔记吗？')) return;

  const notes = await getNotes();
  const filtered = notes.filter(n => n.id !== noteId);
  await saveNotes(filtered);

  // 清理多选状态
  selectedNotes.delete(noteId);
  updateSelectedCount();

  await loadNotesList();
}

// 获取笔记列表
async function getNotes() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

// 保存笔记列表
async function saveNotes(notes) {
  await chrome.storage.local.set({ [STORAGE_KEY]: notes });
}

// 获取预览文本
function getPreview(content) {
  return content.replace(/[#*_`\[\]()]/g, '').substring(0, 200);
}

// 检查是否需要展开按钮
function needsExpandButton(content) {
  // 移除 Markdown 标记后的纯文本
  const plainText = content.replace(/[#*_`\[\]()]/g, '');
  // 计算行数
  const lines = plainText.split('\n').length;
  // 如果超过3行或文本长度超过200字符（预览截断长度），则需要展开按钮
  return lines > 3 || plainText.length > 200;
}

// 格式化日期
function formatDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';

  return date.toLocaleDateString('zh-CN');
}

// HTML转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 复制笔记内容到剪贴板
async function copyToClipboard() {
  const customEditor = document.getElementById('customEditor');
  if (!customEditor) return;

  const markdown = MarkdownConverter.htmlToMarkdown(customEditor.innerHTML);
  if (!markdown.trim()) {
    alert('笔记内容为空');
    return;
  }

  try {
    await navigator.clipboard.writeText(markdown);

    // 显示复制成功的视觉反馈
    const btn = document.getElementById('btnCopy');
    btn.classList.add('copied');
    btn.textContent = '✓';

    setTimeout(() => {
      btn.classList.remove('copied');
      btn.textContent = '📋';
    }, 2000);
  } catch (err) {
    console.error('复制失败:', err);
    alert('复制失败，请重试');
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);
