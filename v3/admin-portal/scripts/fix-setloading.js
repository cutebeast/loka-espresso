const fs = require('fs');

const files = process.argv.slice(2);

files.forEach(file => {
  let src = fs.readFileSync(file, 'utf8');
  const original = src;

  // Pattern A: const x = useCallback(async () => { setLoading(true);
  src = src.replace(
    /(const \w+ = useCallback\(async \(\) => \{)\s*setLoading\(true\);/g,
    '$1'
  );

  // Pattern B: standalone setLoading(true); inside useCallback or useEffect
  // We remove it when it's on its own line, but be careful with indentation
  src = src.replace(
    /^(\s*)setLoading\(true\);\s*$/gm,
    ''
  );

  // Pattern C: setLoading(true); followed by other code on same line
  src = src.replace(
    /setLoading\(true\);\s+/g,
    ''
  );

  // Clean up double blank lines
  src = src.replace(/\n\n\n+/g, '\n\n');

  if (src !== original) {
    fs.writeFileSync(file, src);
    console.log(`✓ ${file}`);
  } else {
    console.log(`✗ ${file} (no change)`);
  }
});
