// 主题配置
const THEMES = {
  minimalist: {
    name: '极简现代',
    icon: '◯',
    description: '清爽简洁，专注工作'
  },
  dark: {
    name: '深色模式',
    icon: '◐',
    description: '护眼舒适，适合夜间'
  },
  colorful: {
    name: '彩色卡片',
    icon: '◆',
    description: '视觉丰富，易于分类'
  },
  glassmorphism: {
    name: '玻璃态',
    icon: '◇',
    description: '高级时尚，现代感强'
  },
  elegant: {
    name: '中性优雅',
    icon: '●',
    description: '温暖舒适，高端感'
  }
};

const THEME_STORAGE_KEY = 'sidenote_theme';

// 获取当前主题
function getCurrentTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  return saved || 'minimalist';
}

// 设置主题
function setTheme(themeName) {
  if (!THEMES[themeName]) return;

  document.documentElement.setAttribute('data-theme', themeName);
  localStorage.setItem(THEME_STORAGE_KEY, themeName);

  // 更新主题按钮状态
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.theme === themeName) {
      btn.classList.add('active');
    }
  });
}

// 初始化主题切换器
function initThemeSwitcher() {
  const switcher = document.getElementById('themeSwitcher');
  if (!switcher) return;

  Object.entries(THEMES).forEach(([key, theme]) => {
    const btn = document.createElement('button');
    btn.className = 'theme-btn';
    btn.dataset.theme = key;
    btn.textContent = theme.icon;
    btn.title = theme.name;
    btn.addEventListener('click', () => setTheme(key));
    switcher.appendChild(btn);
  });

  // 应用保存的主题
  const currentTheme = getCurrentTheme();
  setTheme(currentTheme);
}

// 页面加载时初始化主题
document.addEventListener('DOMContentLoaded', () => {
  initThemeSwitcher();
});
