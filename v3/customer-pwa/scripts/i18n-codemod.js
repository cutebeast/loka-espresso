#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const t = require("@babel/types");

const SRC_DIR = path.resolve(__dirname, "../src");

const SKIP_FILES = [
  "src/app/layout.tsx",
];

function prefixFromPath(relPath) {
  // strip src/ and .tsx
  const parts = relPath.replace(/^src\//, "").replace(/\.tsx$/, "").split("/");
  // For components/auth/LoginModal.tsx -> auth.login_modal
  // For components/CheckoutPage.tsx -> checkout_page
  // For app/page.tsx -> home
  if (parts[0] === "app") return "home";
  if (parts[0] === "components") {
    parts.shift();
    if (parts.length === 1) {
      return parts[0].replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
    }
    // folder/file: e.g. auth/LoginModal.tsx -> auth.login_modal
    const folder = parts.shift();
    const file = parts.join("_").replace(/([a-z])([A-Z])/g, "$1_$2").replace(/\./g, "").toLowerCase();
    return `${folder}.${file}`;
  }
  return parts.join("_").replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

function isAllowedAttr(name) {
  const deny = new Set([
    "className", "class", "id", "name", "type", "value", "defaultValue",
    "href", "src", "srcSet", "key", "ref", "style", "width", "height", "sizes", "loading",
    "htmlFor", "form", "target", "rel", "role", "tabIndex",
    "inputMode", "autoComplete", "autoFocus", "pattern", "maxLength",
    "min", "max", "step", "accept", "multiple", "encType", "method",
    "action", "download", "ping", "referrerPolicy", "dateTime",
    "xmlns", "viewBox", "fill", "stroke", "strokeWidth", "d", "cx", "cy", "r",
    "x", "y", "points", "transform", "clipPath", "fillRule", "strokeLinecap",
    "strokeLinejoin", "color", "opacity", "fontSize", "fontWeight",
    "backgroundColor", "borderRadius", "margin", "padding", "display",
    "justifyContent", "alignItems", "gap", "flex", "gridTemplateColumns",
    "cursor", "pointerEvents", "userSelect", "whiteSpace", "overflow",
    "textOverflow", "textAlign", "position", "top", "left", "right", "bottom",
    "zIndex", "boxShadow", "transition", "animation", "border", "outline",
    "minWidth", "maxWidth", "minHeight", "maxHeight", "objectFit", "objectPosition",
    "dangerouslySetInnerHTML",
  ]);
  if (deny.has(name)) return false;
  if (name === "alt") return true;
  if (name.endsWith("Label")) return true;
  if (name.endsWith("Text")) return true;
  if (name.endsWith("Title")) return true;
  if (name.endsWith("Placeholder")) return true;
  if (name.endsWith("Description")) return true;
  if (name.endsWith("Hint")) return true;
  if (name.endsWith("Message")) return true;
  if (name.endsWith("Badge")) return true;
  const allowed = new Set([
    "label", "placeholder", "title", "aria-label", "aria-description",
    "description", "hint", "tooltip", "heading", "subheading",
    "buttonText", "confirmText", "cancelText", "saveText", "deleteText",
    "submitText", "loadingText", "emptyText", "errorText", "successText",
    "retryText", "searchPlaceholder", "noResultsText", "modalTitle",
    "drawerTitle", "pageTitle", "headerTitle", "tabLabel", "footerText",
  ]);
  return allowed.has(name);
}

function slugify(text) {
  return text
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .map((w) => w.toLowerCase())
    .join("_")
    .replace(/_+/g, "_");
}

function makeKey(prefix, text, seen) {
  let slug = slugify(text) || "text";
  let key = `${prefix}.${slug}`;
  let i = 2;
  while (seen.has(key)) {
    key = `${prefix}.${slug}_${i}`;
    i++;
  }
  seen.add(key);
  return key;
}

function getFunctionNode(path) {
  let fn = path.getFunctionParent();
  while (fn && !["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "ObjectMethod"].includes(fn.node.type)) {
    fn = fn.getFunctionParent();
  }
  return fn ? fn.node : null;
}

function collectBindingNames(node, set) {
  if (!node) return;
  if (node.type === "Identifier") set.add(node.name);
  else if (node.type === "ObjectPattern") {
    for (const prop of node.properties) {
      if (prop.type === "ObjectProperty") collectBindingNames(prop.value, set);
      else if (prop.type === "RestElement") collectBindingNames(prop.argument, set);
    }
  } else if (node.type === "ArrayPattern") {
    for (const el of node.elements) collectBindingNames(el, set);
  } else if (node.type === "RestElement") {
    collectBindingNames(node.argument, set);
  } else if (node.type === "AssignmentPattern") {
    collectBindingNames(node.left, set);
  }
}

function processFile(filePath, allKeys) {
  const relPath = path.relative(path.dirname(SRC_DIR), filePath).replace(/\\/g, "/");
  if (SKIP_FILES.some((p) => relPath.endsWith(p))) return { changed: false, keys: {} };

  const source = fs.readFileSync(filePath, "utf-8");
  let ast;
  try {
    ast = parser.parse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      tokens: true,
    });
  } catch (e) {
    console.error(`Parse error in ${relPath}:`, e.message);
    return { changed: false, keys: {} };
  }

  const prefix = prefixFromPath(relPath);
  const seen = new Set();
  const fileKeys = {};
  let needsImport = false;
  const fnTranslationUsage = new Map();

  // Collect bindings and existing useTranslation declarations
  const existingTranslationFns = new Set();
  const fnBindings = new WeakMap();
  traverse(ast, {
    "FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|ObjectMethod"(path) {
      const names = new Set();
      for (const param of path.node.params) collectBindingNames(param, names);
      const body = path.node.body;
      if (body && body.type === "BlockStatement") {
        for (const stmt of body.body) {
          if (stmt.type === "VariableDeclaration") {
            for (const decl of stmt.declarations) {
              collectBindingNames(decl.id, names);
              // Detect const { t } = useTranslation()
              if (decl.init &&
                  decl.init.type === "CallExpression" &&
                  decl.init.callee.name === "useTranslation" &&
                  decl.id.type === "ObjectPattern") {
                const hasT = decl.id.properties.some(
                  (p) => p.key && p.key.name === "t"
                );
                if (hasT) existingTranslationFns.add(path.node);
              }
            }
          }
        }
      }
      fnBindings.set(path.node, names);
      path.node._bindings = names;
    },
  });

  function chooseIdent(fnNode) {
    if (existingTranslationFns.has(fnNode)) return "t";
    if (fnNode._bindings.has("t")) return "_t";
    return "t";
  }

  function recordUsage(fnNode, ident) {
    if (!fnTranslationUsage.has(fnNode)) {
      fnTranslationUsage.set(fnNode, { ident, count: 0 });
    }
    fnTranslationUsage.get(fnNode).count += 1;
  }

  function getIdentForPath(nodePath) {
    const fnNode = getFunctionNode(nodePath);
    if (!fnNode) return "t";
    if (fnTranslationUsage.has(fnNode)) return fnTranslationUsage.get(fnNode).ident;
    return chooseIdent(fnNode);
  }

  traverse(ast, {
    JSXText(nodePath) {
      const raw = nodePath.node.value;
      const text = raw.replace(/\s+/g, " ").trim();
      if (!text) return;
      if (/^[0-9\W]+$/.test(text)) return;
      if (text === "Loka Espresso") return;
      const key = makeKey(prefix, text, seen);
      fileKeys[key] = text;
      needsImport = true;
      const ident = getIdentForPath(nodePath);
      recordUsage(getFunctionNode(nodePath), ident);
      const expr = t.jsxExpressionContainer(t.callExpression(t.identifier(ident), [t.stringLiteral(key)]));
      nodePath.replaceWith(expr);
      nodePath.skip();
    },
    JSXAttribute(nodePath) {
      const attrName = nodePath.node.name.name;
      if (!isAllowedAttr(attrName)) return;
      const valueNode = nodePath.node.value;
      if (!valueNode || valueNode.type !== "StringLiteral") return;
      const text = valueNode.value.trim();
      if (!text) return;
      if (/^[0-9\W]+$/.test(text)) return;
      if (text === "Loka Espresso") return;
      const key = makeKey(prefix, text, seen);
      fileKeys[key] = text;
      needsImport = true;
      const ident = getIdentForPath(nodePath);
      recordUsage(getFunctionNode(nodePath), ident);
      nodePath.node.value = t.jsxExpressionContainer(t.callExpression(t.identifier(ident), [t.stringLiteral(key)]));
      nodePath.skip();
    },
  });

  if (!needsImport) return { changed: false, keys: {} };

  const hasImport = ast.program.body.some(
    (stmt) => stmt.type === "ImportDeclaration" && stmt.source.value === "@/hooks/useTranslation"
  );
  if (!hasImport) {
    const importDecl = t.importDeclaration(
      [t.importSpecifier(t.identifier("useTranslation"), t.identifier("useTranslation"))],
      t.stringLiteral("@/hooks/useTranslation")
    );
    ast.program.body.unshift(importDecl);
  }

  for (const [fnNode, { ident, count }] of fnTranslationUsage.entries()) {
    if (!fnNode.body || fnNode.body.type !== "BlockStatement") continue;
    if (count === 0) continue;
    if (existingTranslationFns.has(fnNode)) continue;
    const hasDecl = fnNode.body.body.some((stmt) => {
      if (stmt.type !== "VariableDeclaration") return false;
      return stmt.declarations.some((decl) => {
        if (decl.id.type === "ObjectPattern") {
          return decl.id.properties.some((p) => p.key && (p.key.name === ident || p.value.name === ident));
        }
        return decl.id.name === ident;
      });
    });
    if (hasDecl) continue;
    const decl = t.variableDeclaration("const", [
      t.variableDeclarator(
        ident === "t"
          ? t.objectPattern([t.objectProperty(t.identifier("t"), t.identifier("t"), false, true)])
          : t.objectPattern([t.objectProperty(t.identifier("t"), t.identifier(ident), false, false)]),
        t.callExpression(t.identifier("useTranslation"), [])
      ),
    ]);
    fnNode.body.body.unshift(decl);
  }

  const output = generate(ast, { retainLines: false, compact: false }, source).code;
  fs.writeFileSync(filePath, output, "utf-8");

  Object.assign(allKeys, fileKeys);
  return { changed: true, keys: fileKeys };
}

function main() {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (full.endsWith(".tsx") || full.endsWith(".ts")) {
        files.push(full);
      }
    }
  }
  walk(SRC_DIR);

  const allKeys = {};
  let changedCount = 0;
  for (const f of files) {
    const res = processFile(f, allKeys);
    if (res.changed) {
      changedCount++;
      console.log(`Updated: ${path.relative(SRC_DIR, f)} (${Object.keys(res.keys).length} keys)`);
    }
  }

  const keysPath = path.resolve(__dirname, "../extracted-keys.json");
  fs.writeFileSync(keysPath, JSON.stringify(allKeys, null, 2), "utf-8");
  console.log(`\nUpdated ${changedCount} files.`);
  console.log(`Total extracted keys: ${Object.keys(allKeys).length}`);
  console.log(`Keys written to ${keysPath}`);
}

main();
