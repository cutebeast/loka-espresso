const fs = require('fs');
const path = require('path');

function findTsxFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      findTsxFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractBalancedBrace(str, startIdx) {
  // startIdx should be the index of the opening '{'
  if (str[startIdx] !== '{') return null;
  let depth = 1;
  let i = startIdx + 1;
  let inTemplate = false;
  while (i < str.length && depth > 0) {
    const ch = str[i];
    const prev = str[i - 1];
    if (ch === '`') {
      inTemplate = !inTemplate;
    } else if (!inTemplate && ch === '{') {
      depth++;
    } else if (!inTemplate && ch === '}') {
      depth--;
    }
    i++;
  }
  if (depth === 0) {
    return str.slice(startIdx + 1, i - 1);
  }
  return null;
}

let count = 0;
const files = findTsxFiles('src/app');

files.forEach(file => {
  let src = fs.readFileSync(file, 'utf8');
  const original = src;

  // Find each occurrence of className="clickable" and fix its containing element
  let idx = 0;
  while ((idx = src.indexOf('className="clickable"', idx)) !== -1) {
    // Look for onClick= after this position (before the element closes)
    const elementEnd = src.indexOf('>', idx);
    const onClickIdx = src.indexOf('onClick={', idx);

    if (onClickIdx === -1 || onClickIdx > elementEnd) {
      idx += 1;
      continue;
    }

    // Already fixed?
    const between = src.slice(idx, onClickIdx);
    if (between.includes('role="button"') && between.includes('tabIndex={0}')) {
      idx += 1;
      continue;
    }

    // Extract handler with brace balancing
    const braceStart = onClickIdx + 'onClick={'.length - 1; // index of '{'
    const handler = extractBalancedBrace(src, braceStart);
    if (!handler) {
      idx += 1;
      continue;
    }

    const cleanHandler = handler.trim();
    const before = src.slice(0, idx + 'className="clickable"'.length);
    const after = src.slice(idx + 'className="clickable"'.length);

    src = before +
      ` role="button" tabIndex={0}` +
      ` onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();(${cleanHandler})();}}}` +
      after;

    count++;
    idx += 1;
  }

  if (src !== original) {
    fs.writeFileSync(file, src);
    console.log(`✓ ${file}`);
  }
});

console.log(`\nFixed ${count} occurrences across ${files.length} files`);
