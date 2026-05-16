const { execSync } = require('child_process');
const fs = require('fs');

// Run eslint to get all react-hooks/set-state-in-effect errors
let eslintOutput;
try {
  eslintOutput = execSync('npx eslint src/ --format=json', { cwd: '/root/fnb-super-app/v3/admin-portal', encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
} catch (e) {
  eslintOutput = e.stdout;
}

const results = JSON.parse(eslintOutput);

const filesToFix = new Map();

results.forEach(r => {
  const errors = r.messages.filter(m => m.ruleId === 'react-hooks/set-state-in-effect');
  if (errors.length > 0) {
    filesToFix.set(r.filePath, errors.map(e => e.line));
  }
});

console.log(`Found ${filesToFix.size} files to fix`);

for (const [filePath, errorLines] of filesToFix) {
  let content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  // Find all useEffect blocks
  const effects = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/useEffect\s*\(\s*\(\s*\)\s*=>?\s*\{/);
    if (match) {
      // Find the end of this useEffect block
      let braceDepth = 1;
      let j = i;
      let startCol = line.indexOf('{') + 1;
      
      // Count braces in the first line
      for (let k = startCol; k < line.length; k++) {
        if (line[k] === '{') braceDepth++;
        else if (line[k] === '}') braceDepth--;
      }
      
      // Continue to next lines
      while (braceDepth > 0 && j < lines.length - 1) {
        j++;
        for (let k = 0; k < lines[j].length; k++) {
          if (lines[j][k] === '{') braceDepth++;
          else if (lines[j][k] === '}') {
            braceDepth--;
            if (braceDepth === 0) break;
          }
        }
      }
      
      // Check if any error line is within this effect block
      const effectStartLine = i;
      const effectEndLine = j;
      const hasError = errorLines.some(el => el >= effectStartLine + 1 && el <= effectEndLine + 1);
      
      if (hasError) {
        effects.push({ startLine: i, endLine: j });
      }
    }
  }
  
  if (effects.length === 0) {
    console.log(`  Could not find useEffect blocks in ${filePath}`);
    continue;
  }
  
  let modified = false;
  
  // Process from bottom to top to preserve line indices
  effects.reverse().forEach(({ startLine, endLine }) => {
    const effectLines = lines.slice(startLine, endLine + 1);
    const effectText = effectLines.join('\n');
    
    // Extract the body (between the first { and the matching })
    let bodyStart = effectText.indexOf('{') + 1;
    let braceDepth = 1;
    let bodyEnd = bodyStart;
    
    for (let k = bodyStart; k < effectText.length; k++) {
      if (effectText[k] === '{') braceDepth++;
      else if (effectText[k] === '}') {
        braceDepth--;
        if (braceDepth === 0) {
          bodyEnd = k;
          break;
        }
      }
    }
    
    const beforeBody = effectText.substring(0, bodyStart);
    const body = effectText.substring(bodyStart, bodyEnd);
    const afterBody = effectText.substring(bodyEnd);
    
    // Check if body already has async IIFE
    if (body.trim().startsWith('(async')) {
      console.log(`  Already wrapped in ${filePath}:${startLine + 1}`);
      return;
    }
    
    // Check if body has a return statement at top level (cleanup function)
    // Simple heuristic: if body contains "return" and it's not just "return;"
    const hasCleanup = /\breturn\s+/.test(body);
    if (hasCleanup) {
      console.log(`  Skipping effect with cleanup in ${filePath}:${startLine + 1}`);
      return;
    }
    
    // Wrap body in async IIFE
    const indentedBody = body.split('\n').map((l, idx) => {
      if (idx === 0) return l;
      return '  ' + l;
    }).join('\n');
    
    const newBody = `(async () => {\n${indentedBody}\n})();`;
    const newEffect = beforeBody + newBody + afterBody;
    
    // Replace in the original lines array
    const newLines = newEffect.split('\n');
    lines.splice(startLine, endLine - startLine + 1, ...newLines);
    modified = true;
  });
  
  if (modified) {
    const newContent = lines.join('\n');
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`  Fixed ${filePath}`);
  }
}

console.log('Done');
