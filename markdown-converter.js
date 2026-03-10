// HTML 转 Markdown 转换器
const MarkdownConverter = {
  // HTML 转 Markdown
  htmlToMarkdown(html) {
    if (!html || html === '<br>') return '';

    // 创建临时 div 来解析 HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // 清理空的 br 标签
    temp.querySelectorAll('br').forEach(br => {
      br.replaceWith('\n');
    });

    const markdown = this.nodeToMarkdown(temp);

    // 清理多余的空行
    return markdown.replace(/\n{3,}/g, '\n\n').trim();
  },

  nodeToMarkdown(node) {
    let markdown = '';

    for (let child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        markdown += child.textContent;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        markdown += this.elementToMarkdown(child);
      }
    }

    return markdown;
  },

  elementToMarkdown(element) {
    const tag = element.tagName.toLowerCase();
    const content = this.nodeToMarkdown(element);

    switch (tag) {
      case 'h1':
        return `# ${content}\n\n`;
      case 'h2':
        return `## ${content}\n\n`;
      case 'h3':
        return `### ${content}\n\n`;
      case 'strong':
      case 'b':
        return `**${content}**`;
      case 'em':
      case 'i':
        return `*${content}*`;
      case 'del':
      case 's':
      case 'strike':
        return `~~${content}~~`;
      case 'code':
        // 检查是否在 pre 中（代码块）
        if (element.parentElement && element.parentElement.tagName.toLowerCase() === 'pre') {
          return content;
        }
        return `\`${content}\``;
      case 'pre':
        return `\`\`\`\n${content}\n\`\`\`\n\n`;
      case 'ul':
        return this.listToMarkdown(element, false);
      case 'ol':
        return this.listToMarkdown(element, true);
      case 'li':
        return content;
      case 'p':
        return `${content}\n\n`;
      case 'br':
        return '\n';
      case 'div':
        // contenteditable 会自动创建 div，当作段落处理
        return content ? `${content}\n\n` : '';
      default:
        return content;
    }
  },

  listToMarkdown(listElement, ordered) {
    let markdown = '';
    const items = listElement.querySelectorAll(':scope > li');

    items.forEach((item, index) => {
      const prefix = ordered ? `${index + 1}. ` : '- ';
      const content = this.nodeToMarkdown(item).trim();
      markdown += `${prefix}${content}\n`;
    });

    return markdown + '\n';
  },

  // Markdown 转 HTML
  markdownToHtml(markdown) {
    if (!markdown) return '';

    let html = markdown;

    // 代码块（最先处理，避免内部被转换）
    html = html.replace(/```\n?([\s\S]+?)\n?```/g, '<pre><code>$1</code></pre>');

    // 行内代码（在其他格式之前处理）
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 标题（必须在行首）
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // 粗体（在斜体之前处理）
    html = html.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');

    // 斜体
    html = html.replace(/\*([^\*]+)\*/g, '<em>$1</em>');

    // 删除线
    html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // 无序列表
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*?<\/li>\n?)+/g, '<ul>$&</ul>');

    // 有序列表
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*?<\/li>\n?)+/g, (match) => {
      // 如果已经被 ul 包裹，跳过
      if (match.includes('<ul>')) return match;
      return '<ol>' + match + '</ol>';
    });

    // 段落（不是标题、列表的行）
    html = html.replace(/^(?!<[huo]|<li|<pre)(.+)$/gm, '<p>$1</p>');

    // 换行符转为 <br>
    html = html.replace(/\n/g, '<br>');

    // 清理多余的 br
    html = html.replace(/<\/(h[123]|p|ul|ol|pre)><br>/g, '</$1>');
    html = html.replace(/<br><(h[123]|p|ul|ol|pre)/g, '<$1');

    return html;
  }
};
