# DashNote 项目配置

## 任务分工规则
- **编程、文件编写、代码修改、功能修复、Bug 修复**：一律交给 Codex 执行（通过 ModelMesh skill 调用）
- **Claude 的职责**：分析需求、思考方案、拆解任务、向 Codex 下达指令
- Claude 不直接修改代码文件，只负责理解和调度
- **即使是小改动、简单修复，也必须通过 Codex 执行，不允许例外**

## 语言偏好
- 所有回复必须使用中文
- 代码注释可以使用中文或英文
- 错误信息和日志输出保持原样

## 原型输出规范
- 所有涉及到输出原型、UI 布局、流程图的内容，必须使用 ASCII 码生成
- 不使用 Markdown 表格、图片或其他格式
- 使用纯文本 ASCII 艺术来表示界面布局、组件结构、数据流等
- 示例：
  ```
  ┌─────────────────────────┐
  │     DashNote 侧边栏     │
  ├─────────────────────────┤
  │ [+] 新建笔记            │
  ├─────────────────────────┤
  │ 📝 2024-03-04           │
  │ 笔记预览内容...         │
  │ [展开] [🗑]             │
  └─────────────────────────┘
  ```

## 项目信息
- **项目名称**: DashNote
- **项目类型**: Chrome 扩展 - 侧边栏笔记应用
- **主要技术**:
  - Chrome Extension API
  - 自定义 Markdown 编辑器（已移除 Toast UI Editor）
  - Chrome Storage API
  - 自研 Markdown 转换器

## 核心文件
- `sidepanel.js` - 主要业务逻辑（状态管理、渲染、交互）
- `sidepanel.html` - UI 结构和样式
- `markdown-converter.js` - Markdown ↔ HTML 转换器
- `background.js` - 后台脚本
- `manifest.json` - 扩展配置

## 开发约定
- 使用中文编写注释和文档
- 保持代码简洁，避免过度工程化
- 优先考虑用户体验
- **不使用 `onclick` 等内联事件**（CSP 限制）
- **状态修改后必须重新渲染**

---

## 项目演进历史

### 第一阶段：初始开发
- 使用 Toast UI Editor 作为编辑器
- 全屏编辑页模式
- 列表内展开/收起预览

### 第二阶段：编辑器替换
**问题**：Toast UI Editor 工具栏图标显示不稳定
**决策**：移除 Toast UI Editor，改用自定义编辑器
**实现**：
- contenteditable + 自定义工具栏
- 自研 Markdown 转换器（markdown-converter.js）
- HTML ↔ Markdown 双向转换

### 第三阶段：交互重构（当前版本）
**需求**：列表内编辑 + 全屏切换
**重大改动**：
1. 移除全屏编辑页（`#editorView`）
2. 在列表卡片内嵌入编辑器
3. 实现状态机（collapsed/expanded/editing）
4. 添加全屏模式切换
5. 添加浮动收起按钮

---

## 核心交互逻辑

### 状态机设计
每条笔记有三种状态：
- **collapsed**：收起预览
- **expanded**：展开阅读（显示完整内容，不限制高度）
- **editing**：编辑模式（列表内 90% 视口高度，或全屏）

**核心规则**：
- 同一时间只允许 1 条笔记处于非收起状态
- 切换到另一条时，自动保存并收起旧笔记
- 空笔记退出编辑时自动删除

### 操作入口
**卡片操作按钮**（hover 显示，右上角）：
- 收起状态：↓ 展开 | ✎ 编辑 | × 删除
- 展开状态：↑ 收起 | ✎ 编辑 | × 删除
- 编辑状态：⊞/⊡ 全屏切换 | ← 返回

**浮动收起按钮**（右下角）：
- 仅在展开阅读模式时显示
- 点击快速收起当前笔记

### 编辑功能
- **工具栏**：H1/H2/H3、粗体、斜体、删除线、列表、代码
- **自动保存**：输入后 500ms 触发
- **Markdown 语法**：直接在 textarea 中输入 Markdown

---

## UI 设计规范

### 间距系统（4px 倍数）
- 列表容器：`padding: 16px`
- 卡片内边距：`padding: 20px`
- 卡片间距：`margin-bottom: 16px`

### 字体系统
- 日期：11px, 中等粗细, #666
- 正文：15px, 行高 1.6-1.8
- 按钮：12px, 粗体

### 颜色系统（黑白简约）
- 主色：#1a1a1a (黑色)
- 背景：#ffffff (白色)
- 次要背景：#fafafa
- 边框：#e0e0e0, #e5e5e5
- 文字灰色：#666, #999

### 圆角系统
- 卡片：8px
- 按钮：4-6px
- 浮动按钮：50% (圆形)

### 动画系统
- 高度变化：240ms cubic-bezier(0.2, 0, 0, 1)
- 按钮交互：150ms ease
- 透明度：150-200ms ease

---

## 技术细节

### 状态管理
```javascript
let activeNoteId = null;                    // 当前激活的笔记 ID
let modeByNoteId = {};                      // 每条笔记的状态
let isFullscreenByNoteId = {};              // 全屏状态
let isSelectMode = false;                   // 多选模式
let selectedNotes = new Set();              // 已选笔记
let settings = { dateDisplay: 'updatedAt' }; // 设置
```

### 关键函数
- `createNoteCard(note)` - 创建笔记卡片 DOM
- `toggleExpand(noteId)` - 切换展开/收起
- `enterEditing(noteId)` - 进入编辑模式
- `exitEditing(noteId)` - 退出编辑（自动保存或删除）
- `toggleFullscreen(noteId)` - 切换全屏
- `autoSaveNote(noteId, content)` - 自动保存
- `updateCardHeight(card, noteId)` - 更新卡片高度

### Markdown 转换
```javascript
// HTML → Markdown
MarkdownConverter.htmlToMarkdown(html)

// Markdown → HTML
MarkdownConverter.markdownToHtml(markdown)
```

---

## 常见问题与解决方案

### 1. 工具栏图标不显示
**原因**：CSS 样式覆盖过度
**解决**：简化自定义样式，只调整颜色和间距

### 2. onclick 不工作
**原因**：Chrome 扩展 CSP 不允许内联事件处理器
**解决**：使用 `addEventListener` + `data-*` 属性

### 3. 编辑器高度不足
**原因**：flex 布局冲突
**解决**：添加 `height: 100%` 和 `min-height: 0`

### 4. 样式冲突
**原因**：旧的内联编辑样式未清理
**解决**：移除 `.note-textarea`, `.editor-actions` 等旧样式

### 5. 状态不一致
**原因**：多个地方修改状态
**解决**：统一通过状态管理函数修改，调用 `loadNotesList()` 重新渲染

---

## 备份记录

### 重要备份
1. `DashNote_backup_20260305_172533` - 自定义编辑器版本
2. `DashNote_backup_before_refactor_*` - 重构前版本
3. `sidepanel-old.js` - 旧的 JS 文件
4. `sidepanel.js.backup` - JS 备份

### 测试文件
- `test-editor.html` - Toast UI Editor 测试
- `test-converter.html` - Markdown 转换器测试
- `demo-interaction.html` - 交互原型 demo（参考这个！）

---

## 未来优化方向

### 功能增强
- [ ] 图片上传（需要图床服务器）
- [ ] 快捷键支持（Ctrl+B 加粗等）
- [ ] 撤销/重做功能
- [ ] 更多格式（引用、分隔线、表格）
- [ ] 笔记导出（Markdown 文件）
- [ ] 笔记搜索优化（高亮关键词）

### 性能优化
- [ ] 虚拟滚动（大量笔记时）
- [ ] 防抖优化（搜索、自动保存）
- [ ] 懒加载（长笔记内容）

### 用户体验
- [ ] 拖拽排序
- [ ] 笔记分类/标签
- [ ] 主题切换（暗色模式）
- [ ] 快捷键提示

---

## 开发注意事项

### 必须遵守的规则
1. **不使用 `onclick` 等内联事件**（CSP 限制）
2. **状态修改后必须调用 `loadNotesList()`** 重新渲染
3. **编辑器内容变化必须触发自动保存**
4. **空笔记必须自动删除**（避免垃圾数据）
5. **同时只能有一条笔记处于激活状态**

### 调试技巧
1. 使用 `console.log` 查看状态变化
2. 检查 Chrome 扩展控制台错误
3. 使用独立测试页面验证功能
4. 备份后再做大改动

### 代码风格
- 使用 `async/await` 处理异步操作
- 函数命名清晰（动词开头）
- 注释关键逻辑
- 保持代码简洁

---

## Gemini Designer 调用问题排查记录

### 问题现象
调用 `gemini-designer` skill 时出现超时错误（退出码 28）

### 根本原因
1. **中文提示词过长**：复杂的中文描述会导致请求体积过大，增加处理时间
2. **默认超时设置不足**：原始设置为 30 秒连接超时 + 120 秒最大执行时间

### 解决方案
1. **增加超时时间**（已完成）：
   - 修改文件：`~/.claude/skills/gemini-designer/scripts/ask_gemini.sh`
   - 连接超时：30 秒 → 60 秒
   - 最大执行时间：120 秒 → 240 秒

2. **优化提示词**（推荐做法）：
   - 使用简洁的英文提示词代替复杂的中文描述
   - 避免过长的需求列表，提炼核心要点
   - 示例对比：
     ```bash
     # ❌ 过长的中文提示（容易超时）
     "为 DashNote Chrome 扩展设计 10 个不同的 128x128 像素图标变体。要求：1. 白色背景... 2. 中间是突出的黑色线条... 3. 形状可以是..."

     # ✅ 简洁的英文提示（成功率高）
     "Create 10 different 128x128px SVG icon designs for DashNote. White background, bold black geometric shapes, clean minimal lines."
     ```

3. **测试 API 连接**：
   ```bash
   # 如果遇到问题，先测试基础连接
   api_key=$(cat ~/.config/gemini-designer/api_key | tr -d '[:space:]')
   curl -s -X POST "https://linkapi.ai/v1/chat/completions" \
     -H "Authorization: Bearer ${api_key}" \
     -d '{"model":"gemini-3.1-pro-preview","messages":[{"role":"user","content":"Hello"}]}'
   ```

### 经验总结
- Gemini API 是可用的，关键在于请求优化
- 遇到超时问题时，优先简化提示词，而不是无限增加超时时间
- 英文提示词通常比中文更高效（token 数量更少）

---

**最后更新**：2026-03-11
**版本**：2.0（重构后）
**状态**：稳定运行

