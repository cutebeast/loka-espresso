/**
 * Lightweight Markdown renderer with table, list, code, and blockquote support.
 * Used by the help center across all three portals.
 *
 * This is intentionally simple — no external dependencies.
 * Supports: headings, bold, italic, inline code, code blocks,
 * unordered lists, ordered lists, blockquotes, tables, hr, and links.
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Apply inline markdown: bold, italic, code, links */
function applyInline(html: string): string {
  // Inline code: `code`  (must run before bold/italic so ** inside `..` is preserved)
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Links: [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  // Bold: **text**
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  // Italic: *text*  (but not ** or inside tags)
  html = html.replace(/(^|[^*])\*(?!\*)([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
  return html;
}

/** Parse markdown table block into HTML table */
function parseTable(lines: string[]): string {
  if (lines.length < 2) return lines.join("\n");

  // First line = header row
  const headerCells = (lines[0] || "")
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  // Second line = separator (e.g. |---|:--|---:|)
  // We can infer alignment from it
  const separator = lines[1] || "";
  const aligns = separator
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .map((c) => {
      if (c.startsWith(":") && c.endsWith(":")) return "center";
      if (c.endsWith(":")) return "right";
      return "left";
    });

  const bodyLines = lines.slice(2);
  const bodyRows = bodyLines
    .filter((l) => l.trim().length > 0)
    .map((l) =>
      l
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c.length > 0)
    );

  let html = '<table class="md-table">\n<thead>\n<tr>\n';
  headerCells.forEach((cell, i) => {
    const align = aligns[i] || "left";
    html += `<th style="text-align:${align}">${applyInline(cell)}</th>\n`;
  });
  html += "</tr>\n</thead>\n<tbody>\n";

  bodyRows.forEach((row) => {
    html += "<tr>\n";
    headerCells.forEach((_, i) => {
      const align = aligns[i] || "left";
      const cell = row[i] || "";
      html += `<td style="text-align:${align}">${applyInline(cell)}</td>\n`;
    });
    html += "</tr>\n";
  });

  html += "</tbody>\n</table>";
  return html;
}

export function renderMarkdown(md: string): string {
  if (!md) return "";

  // Step 1: Escape HTML
  let text = escapeHtml(md);

  // Step 2: Extract code blocks (```...```) so they're not mangled
  const codeBlocks: string[] = [];
  text = text.replace(/```([\s\S]*?)```/g, (_m, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
    return `\x00CODEBLOCK${idx}\x00`;
  });

  // Step 3: Split into lines for block-level parsing
  const lines = text.split("\n");
  const output: string[] = [];

  let i = 0;
  let inList: "ul" | "ol" | null = null;
  let listItems: string[] = [];

  const flushList = () => {
    if (inList && listItems.length > 0) {
      const tag = inList;
      const items = listItems.map((li) => `<li>${applyInline(li)}</li>`).join("");
      output.push(`<${tag}>${items}</${tag}>`);
    }
    inList = null;
    listItems = [];
  };

  while (i < lines.length) {
    const line = lines[i] || "";
    const trimmed = line.trim();

    // Code block placeholder
    const codeBlockMatch = trimmed.match(/^\x00CODEBLOCK(\d+)\x00$/);
    if (codeBlockMatch) {
      flushList();
      output.push(codeBlocks[parseInt(codeBlockMatch[1] || "0")] || "");
      i++;
      continue;
    }

    // Empty line
    if (trimmed === "") {
      flushList();
      i++;
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      const level = (headingMatch[1] || "").length;
      output.push(`<h${level}>${applyInline(headingMatch[2] || "")}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushList();
      output.push("<hr />");
      i++;
      continue;
    }

    // Blockquote
    if (/^&gt;\s?/.test(trimmed)) {
      flushList();
      const quoteContent = trimmed.replace(/^&gt;\s?/, "");
      output.push(`<blockquote>${applyInline(quoteContent)}</blockquote>`);
      i++;
      continue;
    }

    // Table detection: line has | and next line is a separator
    if (trimmed.includes("|") && i + 1 < lines.length) {
      const nextLine = (lines[i + 1] || "").trim();
      if (/^\|?[\s:|-]+\|[\s:|-|]*$/.test(nextLine) && nextLine.includes("-")) {
        flushList();
        // Collect all consecutive table lines
        const tableLines: string[] = [];
        while (
          i < lines.length &&
          (lines[i] ?? "").trim().includes("|") &&
          (lines[i] ?? "").trim().length > 0
        ) {
          tableLines.push((lines[i] ?? "").trim());
          i++;
        }
        output.push(parseTable(tableLines));
        continue;
      }
    }

    // Unordered list item: * or - or •
    const ulMatch = trimmed.match(/^[\s]*[*\-•]\s+(.*)$/);
    if (ulMatch) {
      if (inList !== "ul") {
        flushList();
        inList = "ul";
      }
      listItems.push(ulMatch[1] || "");
      i++;
      continue;
    }

    // Ordered list item: 1. or 1)
    const olMatch = trimmed.match(/^[\s]*\d+[.)]\s+(.*)$/);
    if (olMatch) {
      if (inList !== "ol") {
        flushList();
        inList = "ol";
      }
      listItems.push(olMatch[1] || "");
      i++;
      continue;
    }

    // Regular paragraph
    flushList();
    output.push(`<p>${applyInline(trimmed)}</p>`);
    i++;
  }

  flushList();

  let html = output.join("\n");

  // Step 4: Restore code blocks
  html = html.replace(/\x00CODEBLOCK(\d+)\x00/g, (_m: string, idx: string) => codeBlocks[parseInt(idx)] || "");

  return html;
}
