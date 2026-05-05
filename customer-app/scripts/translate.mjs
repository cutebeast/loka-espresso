#!/usr/bin/env node
/**
 * Bulk translation script for LOKA Espresso i18n.
 *
 * Usage:
 *   npm run translate
 *
 * Strategy (in priority order):
 * 1. Call internal API endpoint if TRANSLATE_API_ENDPOINT is set.
 *    The backend can route to any LLM (self-hosted, DeepSeek, OpenAI, etc.)
 * 2. Call DeepL API directly if DEEPL_API_KEY is set.
 * 3. Copy English fallback to missing keys as a last resort.
 *
 * Environment variables:
 *   TRANSLATE_API_ENDPOINT  e.g. "https://admin.loyaltysystem.uk/api/v1/translate/bulk"
 *   DEEPL_API_KEY           Your DeepL API key
 *   DEEPL_API_URL           "https://api-free.deepl.com/v2/translate" (default)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, '../src/locales');
const SOURCE_LANG = 'en';
const TARGET_LANGS = ['ms', 'zh', 'ta', 'tr'];

const API_ENDPOINT = process.env.TRANSLATE_API_ENDPOINT;
const DEEPL_KEY = process.env.DEEPL_API_KEY;
const DEEPL_URL = process.env.DEEPL_API_URL || 'https://api-free.deepl.com/v2/translate';

/** Flatten a nested JSON object into dot-notation keys. */
function flatten(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      result[fullKey] = value;
    } else if (value && typeof value === 'object') {
      Object.assign(result, flatten(value, fullKey));
    }
  }
  return result;
}

/** Unflatten dot-notation keys back into a nested object. */
function unflatten(flat) {
  const result = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) current[part] = {};
      current = current[part];
    }
    current[parts[parts.length - 1]] = value;
  }
  return result;
}

/** Call internal API endpoint for bulk translation. */
async function translateViaApi(texts, targetLang) {
  const res = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts, targetLang, sourceLang: SOURCE_LANG }),
  });
  if (!res.ok) throw new Error(`API returned ${res.status}: ${await res.text()}`);
  const data = await res.json();
  // Expect { translations: ["...", "..."] } or { results: ["...", "..."] }
  const results = data.translations ?? data.results ?? data;
  if (!Array.isArray(results) || results.length !== texts.length) {
    throw new Error('Unexpected API response format');
  }
  return results;
}

/** Call DeepL API directly for bulk translation. */
async function translateViaDeepL(texts, targetLang) {
  const body = new URLSearchParams();
  body.append('source_lang', SOURCE_LANG.toUpperCase());
  body.append('target_lang', targetLang.toUpperCase());
  for (const text of texts) body.append('text', text);

  const res = await fetch(DEEPL_URL, {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${DEEPL_KEY}` },
    body,
  });
  if (!res.ok) throw new Error(`DeepL returned ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.translations.map((t) => t.text);
}

/** Translate a batch of texts using the best available provider. */
async function translateBatch(texts, targetLang) {
  if (texts.length === 0) return [];
  if (API_ENDPOINT) return translateViaApi(texts, targetLang);
  if (DEEPL_KEY) return translateViaDeepL(texts, targetLang);
  // Fallback: return English text unchanged
  return [...texts];
}

async function main() {
  console.log('[translate] Starting bulk translation...');
  console.log(`[translate] Source: ${SOURCE_LANG}`);
  console.log(`[translate] Targets: ${TARGET_LANGS.join(', ')}`);

  if (API_ENDPOINT) console.log(`[translate] Using API endpoint: ${API_ENDPOINT}`);
  else if (DEEPL_KEY) console.log(`[translate] Using DeepL directly`);
  else console.log(`[translate] No API configured — copying English fallbacks`);

  // Load source English dictionary
  const sourcePath = path.join(LOCALES_DIR, `${SOURCE_LANG}.json`);
  const sourceRaw = await fs.readFile(sourcePath, 'utf-8');
  const sourceDict = JSON.parse(sourceRaw);
  const sourceFlat = flatten(sourceDict);
  const sourceKeys = Object.keys(sourceFlat);

  for (const targetLang of TARGET_LANGS) {
    const targetPath = path.join(LOCALES_DIR, `${targetLang}.json`);
    let targetFlat = {};
    try {
      const targetRaw = await fs.readFile(targetPath, 'utf-8');
      targetFlat = flatten(JSON.parse(targetRaw));
    } catch {
      // File doesn't exist or is empty — start fresh
    }

    // Find missing keys
    const missingKeys = sourceKeys.filter((k) => !(k in targetFlat));
    if (missingKeys.length === 0) {
      console.log(`[translate] ${targetLang}: all keys present ✓`);
      continue;
    }

    console.log(`[translate] ${targetLang}: ${missingKeys.length} missing keys`);

    // Batch translate in chunks of 50 (API rate limit / payload size friendliness)
    const CHUNK_SIZE = 50;
    for (let i = 0; i < missingKeys.length; i += CHUNK_SIZE) {
      const chunkKeys = missingKeys.slice(i, i + CHUNK_SIZE);
      const chunkTexts = chunkKeys.map((k) => sourceFlat[k]);
      const translations = await translateBatch(chunkTexts, targetLang);

      for (let j = 0; j < chunkKeys.length; j++) {
        targetFlat[chunkKeys[j]] = translations[j];
      }

      console.log(`[translate] ${targetLang}: translated ${Math.min(i + CHUNK_SIZE, missingKeys.length)}/${missingKeys.length}`);
    }

    // Write updated target file
    const targetDict = unflatten(targetFlat);
    await fs.writeFile(targetPath, JSON.stringify(targetDict, null, 2) + '\n', 'utf-8');
    console.log(`[translate] ${targetLang}: saved ✓`);
  }

  console.log('[translate] Done.');
}

main().catch((err) => {
  console.error('[translate] Fatal error:', err);
  process.exit(1);
});
