const fs = require('fs');
const path = require('path');

function findFiles(dir, pattern, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      findFiles(fullPath, pattern, files);
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

let count = 0;
const files = findFiles('src/app');

files.forEach(file => {
  let src = fs.readFileSync(file, 'utf8');
  const original = src;

  // Pattern: useEffect(()=>{load();},[id]); followed by const load = async () => {
  // We need to:
  // 1. Add useCallback to imports if missing
  // 2. Change const load = async () => { to const load = useCallback(async () => {
  // 3. Close load with }, [id]); instead of };
  // 4. Change useEffect(()=>{load();},[id]); to useEffect(()=>{load();},[load]);

  const hasLoadPattern = src.includes('useEffect(()=>{load();},[id])') && src.includes('const load = async () => {');
  if (!hasLoadPattern) return;

  // Add useCallback import
  if (!src.includes('useCallback')) {
    src = src.replace(
      /import \{ useEffect, useState(,?\s*)\}/,
      (match, comma) => `import { useEffect, useState, useCallback }`
    );
    src = src.replace(
      /import \{ useEffect, useState, useRef(,?\s*)\}/,
      (match, comma) => `import { useEffect, useState, useRef, useCallback }`
    );
  }

  // Find the load function and its closing brace
  const loadStart = src.indexOf('const load = async () => {');
  if (loadStart === -1) return;

  // Find the matching closing brace for load function
  let depth = 1;
  let i = loadStart + 'const load = async () => {'.length;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }

  if (depth !== 0) return;

  // Check if already fixed
  const afterLoad = src.slice(i, i + 20);
  if (afterLoad.includes('useCallback') || afterLoad.trim().startsWith(',')) return;

  // Replace const load = async () => { with const load = useCallback(async () => {
  src = src.slice(0, loadStart) + 'const load = useCallback(async () => {' + src.slice(loadStart + 'const load = async () => {'.length);

  // Replace the closing }; with }, [id]);
  src = src.slice(0, i - 1) + '}, [id]);' + src.slice(i);

  // Replace useEffect(()=>{load();},[id]); with useEffect(()=>{load();},[load]);
  src = src.replace(
    /useEffect\(\(\)=>\{load\(\);\},\[id\]\);/g,
    'useEffect(()=>{load();},[load]);'
  );

  if (src !== original) {
    fs.writeFileSync(file, src);
    console.log(`✓ ${file}`);
    count++;
  }
});

console.log(`\nFixed ${count} files`);
