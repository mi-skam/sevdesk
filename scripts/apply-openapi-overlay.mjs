// Applies openapi.overlay.yaml (OpenAPI Overlay 1.0) to the downloaded
// openapi.yaml and writes openapi.patched.yaml.
//
//   node scripts/apply-openapi-overlay.mjs [spec] [overlay] [output]
//
// Supports the JSONPath subset the overlay uses: `$`, `.name`, `['name']`,
// `[0]` and `[?(@.key == 'value')]`. Every action must match at least one
// node, so a target that disappears from a newer upstream spec fails loudly
// instead of being skipped. Updates merge objects recursively and append to
// arrays, as the Overlay specification defines.
import console from 'node:console';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { parse, stringify } from 'yaml';

const root = fileURLToPath(new URL('../', import.meta.url));
const [
  specPath = join(root, 'openapi.yaml'),
  overlayPath = join(root, 'openapi.overlay.yaml'),
  outputPath = join(root, 'openapi.patched.yaml'),
] = process.argv.slice(2);

/** Splits a JSONPath expression into segments. */
export function parsePath(path) {
  if (!path.startsWith('$'))
    throw new Error(`Target must start with $: ${path}`);
  const segments = [];
  let rest = path.slice(1);
  while (rest.length > 0) {
    let match;
    if ((match = /^\.([A-Za-z_$][\w$-]*)/.exec(rest))) {
      segments.push({ key: match[1] });
    } else if ((match = /^\[(['"])(.*?)\1\]/.exec(rest))) {
      segments.push({ key: match[2] });
    } else if ((match = /^\[(\d+)\]/.exec(rest))) {
      segments.push({ key: Number(match[1]) });
    } else if (
      (match = /^\[\?\(@\.([\w$-]+)\s*==\s*(['"])(.*?)\2\)\]/.exec(rest))
    ) {
      segments.push({ filter: { key: match[1], value: match[3] } });
    } else {
      throw new Error(`Unsupported JSONPath at "${rest}" in ${path}`);
    }
    rest = rest.slice(match[0].length);
  }
  return segments;
}

/** Every node a target matches, with its parent and key for removal. */
export function resolve(document, path) {
  let nodes = [{ parent: null, key: null, value: document }];
  for (const segment of parsePath(path)) {
    const next = [];
    for (const { value } of nodes) {
      if (value === null || typeof value !== 'object') continue;
      if (segment.filter) {
        if (!Array.isArray(value)) continue;
        value.forEach((item, index) => {
          if (
            item &&
            typeof item === 'object' &&
            String(item[segment.filter.key]) === segment.filter.value
          ) {
            next.push({ parent: value, key: index, value: item });
          }
        });
      } else if (Object.hasOwn(value, segment.key)) {
        next.push({
          parent: value,
          key: segment.key,
          value: value[segment.key],
        });
      }
    }
    nodes = next;
  }
  return nodes;
}

/** Overlay merge: objects recursively, arrays appended, scalars replaced. */
export function merge(target, update) {
  if (Array.isArray(target) && Array.isArray(update)) {
    target.push(...clone(update));
    return target;
  }
  if (isObject(target) && isObject(update)) {
    for (const [key, value] of Object.entries(update)) {
      target[key] =
        Object.hasOwn(target, key) &&
        ((isObject(target[key]) && isObject(value)) ||
          (Array.isArray(target[key]) && Array.isArray(value)))
          ? merge(target[key], value)
          : clone(value);
    }
    return target;
  }
  throw new Error(
    'An update must be an object or an array matching its target.',
  );
}

/** Overlay values are parsed YAML, so a JSON round trip copies them fully. */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function applyOverlay(document, overlay) {
  if (!/^1\.\d+\.\d+$/.test(String(overlay.overlay))) {
    throw new Error(`Unsupported overlay version: ${overlay.overlay}`);
  }
  for (const [index, action] of overlay.actions.entries()) {
    const nodes = resolve(document, action.target);
    if (nodes.length === 0) {
      throw new Error(
        `Action ${index + 1} matches nothing: ${action.target}. The upstream spec has changed; update the overlay.`,
      );
    }
    if (action.remove) {
      // Remove from the back so array indexes stay valid.
      for (const { parent, key } of [...nodes].reverse()) {
        if (Array.isArray(parent)) parent.splice(key, 1);
        else delete parent[key];
      }
    } else if (action.update !== undefined) {
      for (const node of nodes) merge(node.value, action.update);
    }
  }
  return document;
}

/** Every local `$ref` must point at an existing node. */
export function danglingRefs(document) {
  const missing = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (isObject(value)) {
      if (typeof value.$ref === 'string' && value.$ref.startsWith('#/')) {
        const pointer = value.$ref
          .slice(2)
          .split('/')
          .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
        let node = document;
        for (const part of pointer) node = node?.[part];
        if (node === undefined) missing.add(value.$ref);
      }
      Object.values(value).forEach(visit);
    }
  };
  visit(document);
  return [...missing];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let spec;
  try {
    spec = parse(await readFile(specPath, 'utf8'));
  } catch {
    console.error(
      `Cannot read ${specPath}. Download it first:\n  curl -fsSL https://api.sevdesk.de/openapi.yaml -o openapi.yaml`,
    );
    process.exit(1);
  }
  const overlay = parse(await readFile(overlayPath, 'utf8'));
  const patched = applyOverlay(spec, overlay);
  const missing = danglingRefs(patched);
  if (missing.length > 0) {
    throw new Error(`Unresolved $ref after patching: ${missing.join(', ')}`);
  }
  await writeFile(outputPath, stringify(patched, { lineWidth: 0 }));
  console.log(
    `Applied ${overlay.actions.length} overlay actions to ${specPath} (info.version ${spec.info?.version}); wrote ${outputPath}.`,
  );
}
