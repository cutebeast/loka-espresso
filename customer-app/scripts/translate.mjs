#!/usr/bin/env node
/**
 * Bulk translation script for LOKA Espresso i18n.
 *
 * Usage:
 *   DEEPL_API_KEY=xxx DEEPSEEK_API_KEY=yyy npm run translate
 *
 * Priority:
 * 1. DeepL API direct — primary (best quality for short UI phrases)
 * 2. DeepSeek API (deepseek-chat model — fast / cheap) — fallback
 * 3. English copy — last resort
 *
 * Environment variables:
 *   DEEPL_API_KEY           DeepL API key (primary)
 *   DEEPL_API_URL           "https://api-free.deepl.com/v2/translate" (default)
 *   DEEPSEEK_API_KEY        DeepSeek API key (fallback)
 *   DEEPSEEK_API_URL        "https://api.deepseek.com/v1/chat/completions" (default)
 *   DEEPSEEK_MODEL          "deepseek-chat" (default — the fast V3 model)
 *   TRANSLATE_API_ENDPOINT  Your own backend endpoint (overrides everything if set)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, '../src/locales');
const SOURCE_LANG = 'en';
const TARGET_LANGS = ['ms', 'zh', 'ta', 'tr'];

const API_ENDPOINT = process.env.TRANSLATE_API_ENDPOINT;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const DEEPL_KEY = process.env.DEEPL_API_KEY;
const DEEPL_URL = process.env.DEEPL_API_URL || 'https://api-free.deepl.com/v2/translate';

const LOCALE_NAMES = {
  ms: 'Malay (Bahasa Malaysia)',
  zh: 'Simplified Chinese',
  ta: 'Tamil',
  tr: 'Turkish',
};

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
  const results = data.translations ?? data.results ?? data;
  if (!Array.isArray(results) || results.length !== texts.length) {
    throw new Error('Unexpected API response format');
  }
  return results;
}

/** Call DeepSeek API (deepseek-chat model) for bulk translation. */
async function translateViaDeepSeek(texts, targetLang) {
  const langName = LOCALE_NAMES[targetLang] || targetLang;
  const prompt = `Translate the following UI strings from English to ${langName}.
Rules:
- Preserve all placeholders like {count}, {amount}, {name}, {points}, {tier}, {radius}, {minutes} exactly as-is. Do NOT translate text inside curly braces.
- Keep the tone friendly and concise (suitable for a mobile app).
- Return ONLY a JSON array of translated strings in the exact same order. No explanations, no markdown.`;

  const userContent = JSON.stringify(texts, null, 2);

  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek returned ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('DeepSeek returned empty content');

  // Parse JSON — DeepSeek might return {"translations": [...]} or just raw JSON array
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Sometimes it wraps in markdown code blocks
    const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
    parsed = JSON.parse(cleaned);
  }

  const results = Array.isArray(parsed) ? parsed : parsed.translations ?? parsed.results;
  if (!Array.isArray(results) || results.length !== texts.length) {
    console.error('[translate] DeepSeek response mismatch. Expected', texts.length, 'items, got', results?.length);
    console.error('[translate] Raw response:', content);
    throw new Error('DeepSeek response format mismatch');
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
  if (DEEPSEEK_KEY) return translateViaDeepSeek(texts, targetLang);
  return [...texts];
}

async function main() {
  console.log('[translate] Starting bulk translation...');
  console.log(`[translate] Source: ${SOURCE_LANG}`);
  console.log(`[translate] Targets: ${TARGET_LANGS.join(', ')}`);

  if (API_ENDPOINT) console.log(`[translate] Using internal API: ${API_ENDPOINT}`);
  else if (DEEPL_KEY) console.log(`[translate] Using DeepL (primary)`);
  else if (DEEPSEEK_KEY) console.log(`[translate] Using DeepSeek (${DEEPSEEK_MODEL}) fallback`);
  else console.log(`[translate] No API configured — copying English fallbacks`);

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
      // Start fresh
    }

    const missingKeys = sourceKeys.filter((k) => !(k in targetFlat));
    if (missingKeys.length === 0) {
      console.log(`[translate] ${targetLang}: all keys present ✓`);
      continue;
    }

    console.log(`[translate] ${targetLang}: ${missingKeys.length} missing keys`);

    // DeepL supports up to 50 texts per request; DeepSeek can handle larger batches
    const CHUNK_SIZE = DEEPL_KEY ? 50 : 60;
    for (let i = 0; i < missingKeys.length; i += CHUNK_SIZE) {
      const chunkKeys = missingKeys.slice(i, i + CHUNK_SIZE);
      const chunkTexts = chunkKeys.map((k) => sourceFlat[k]);
      try {
        const translations = await translateBatch(chunkTexts, targetLang);
        for (let j = 0; j < chunkKeys.length; j++) {
          targetFlat[chunkKeys[j]] = translations[j];
        }
        console.log(`[translate] ${targetLang}: translated ${Math.min(i + CHUNK_SIZE, missingKeys.length)}/${missingKeys.length}`);
      } catch (err) {
        console.error(`[translate] ${targetLang}: chunk failed, falling back to English`, err.message);
        for (const k of chunkKeys) {
          targetFlat[k] = sourceFlat[k];
        }
      }
    }

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
