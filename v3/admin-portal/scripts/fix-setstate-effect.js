const fs = require('fs');
const { execSync } = require('child_process');

function getFilesWithError() {
  try {
    const out = execSync('npx eslint src/ 2>&1', { encoding: 'utf8', cwd: process.cwd(), timeout: 120000 });
    return [];
  } catch (e) {
    const out = e.stdout || e.message || '';
    const files = new Set();
    const lines = out.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('setState synchronously')) {
        // Look backward for the file path
        for (let j = i - 1; j >= 0; j--) {
          if (lines[j].startsWith('/root/fnb-super-app/v3/admin-portal/src/')) {
            files.add(lines[j].split(':')[0]);
            break;
          }
        }
      }
    }
    return Array.from(files);
  }
}

function addUseCallbackImport(src) {
  if (src.includes('useCallback')) return src;
  src = src.replace(/import \{ useEffect, useState(,?\s*)\}/, 'import { useEffect, useState, useCallback }');
  src = src.replace(/import \{ useEffect, useState, useRef(,?\s*)\}/, 'import { useEffect, useState, useRef, useCallback }');
  src = src.replace(/import \{ useEffect, useRef(,?\s*)\}/, 'import { useEffect, useRef, useCallback }');
  return src;
}

function removeSetLoadingTrue(src) {
  // Pattern 1: const fetch = useCallback(() => { setLoading(true); api.get... }, [deps]);
  // Remove setLoading(true); from inside useCallback
  src = src.replace(
    /(const \w+ = useCallback\(\(\) => \{)\s*setLoading\(true\);\s*/,
    '$1 '
  );

  // Pattern 2: const fetch = () => { setLoading(true); api.get... };
  // Change to useCallback and remove setLoading(true)
  src = src.replace(
    /const (\w+) = \(\) => \{\s*setLoading\(true\);\s*(api\.get[\s\S]*?\.finally\(\(\) => setLoading\(false\)\);)/,
    'const $1 = useCallback(() => { $2 }, []);'
  );

  // Pattern 3: const load = async () => { setLoading(true); ... };
  src = src.replace(
    /const (\w+) = async \(\) => \{\s*setLoading\(true\);/,
    'const $1 = useCallback(async () => {'
  );
  // Close with useCallback deps for load patterns
  src = src.replace(
    /(const load = useCallback\(async \(\) => \{[\s\S]*?finally \{ setLoading\(false\); \}\s*\})\s*;/,
    '$1, [id]);'
  );

  // Pattern 4: inline useEffect with setLoading(true)
  src = src.replace(
    /(useEffect\(\(\) => \{\n?\s*)setLoading\(true\);\s*/,
    '$1'
  );

  // Pattern 5: useEffect(()=>{fetch();},[]); -> useEffect(()=>{fetch();},[fetch]);
  src = src.replace(
    /useEffect\(\(\)=>\{(\w+)\(\);\},\[\]\);/g,
    'useEffect(()=>{$1();},[$1]);'
  );

  // Pattern 6: useEffect(() => { load(); }, [id]); -> useEffect(() => { load(); }, [load]);
  src = src.replace(
    /useEffect\(\(\) => \{ (\w+)\(\); \}, \[id\]\);/g,
    'useEffect(() => { $1(); }, [$1]);'
  );

  // Pattern 7: useEffect(() => { fetchData(); }, [consentTypeFilter, statusFilter]);
  // If fetchData is now useCallback, change deps to [fetchData]
  src = src.replace(
    /useEffect\(\(\) => \{ (fetchData)\(\); \}, \[[^\]]+\]\);/g,
    'useEffect(() => { $1(); }, [$1]);'
  );

  // Pattern 8: useEffect(() => { fetch(); }, []);
  src = src.replace(
    /useEffect\(\(\) => \{ (fetch)\(\); \}, \[\]\);/g,
    'useEffect(() => { $1(); }, [$1]);'
  );

  // Pattern 9: customers/[id] fetchTab
  src = src.replace(
    /useEffect\(\(\) => \{ fetchTab\(tab\); \}, \[tab, fetchTab\]\);/,
    'useEffect(() => { fetchTab(tab); }, [tab, fetchTab]);'
  );

  return src;
}

function fixFile(file) {
  let src = fs.readFileSync(file, 'utf8');
  const original = src;

  src = addUseCallbackImport(src);
  src = removeSetLoadingTrue(src);

  if (src !== original) {
    fs.writeFileSync(file, src);
    return true;
  }
  return false;
}

const files = getFilesWithError();
console.log(`Found ${files.length} files with set-state-in-effect errors:`);
files.forEach(f => console.log('  ' + f));

let fixed = 0;
for (const file of files) {
  if (fixFile(file)) {
    console.log(`✓ ${file}`);
    fixed++;
  } else {
    console.log(`✗ ${file} (no changes applied)`);
  }
}

console.log(`\nModified ${fixed} files`);
