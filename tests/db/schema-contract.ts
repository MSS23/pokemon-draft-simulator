/**
 * Schema-contract checker: compares the hand-written `Database` type in
 * src/lib/supabase.ts (and every literal `.rpc('name', {...})` call in src/)
 * against PostgREST's OpenAPI document for a real database.
 *
 * Pure functions only, so the parser is unit-tested offline and the live
 * comparison runs in tests/db/schema-contract.test.ts when a test DB is set.
 */
import fs from 'node:fs'
import path from 'node:path'

export interface Entry {
  key: string
  value: string
}

const OPEN = '{[(<'
const CLOSE = '}])>'

/**
 * Returns the top-level `key: value` / shorthand `key` entries of the object
 * literal (TS type or JS value) whose `{` is at `text[start]`.
 * `angle` tracks `<...>` as nesting, which is right for TS types but not for JS
 * values (where `>` can be an operator).
 */
export function topLevelEntries(text: string, start: number, angle: boolean): { entries: Entry[]; end: number } {
  if (text[start] !== '{') throw new Error(`expected '{' at ${start}`)
  const entries: Entry[] = []
  let depth = 0
  let chunk = ''
  const flush = () => {
    const m = chunk.trim().match(/^(?:\.\.\.)?['"]?([A-Za-z_$][\w$]*)['"]?\??\s*(?::([\s\S]*))?$/)
    if (m && !chunk.trim().startsWith('...')) entries.push({ key: m[1], value: (m[2] ?? '').trim() })
    chunk = ''
  }
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      i = text[i + 1] === '/' ? text.indexOf('\n', i) - 1 : text.indexOf('*/', i) + 1
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      let close = i + 1
      while (close < text.length && (text[close] !== c || text[close - 1] === '\\')) close++
      chunk += text.slice(i, close + 1)
      i = close
      continue
    }
    const isOpen = OPEN.includes(c) && (angle || c !== '<')
    const isClose = CLOSE.includes(c) && (angle || c !== '>') && !(c === '>' && text[i - 1] === '=')
    if (isOpen) {
      depth++
      if (depth === 1) continue
    } else if (isClose) {
      depth--
      if (depth === 0) {
        flush()
        return { entries, end: i }
      }
    } else if (depth === 1 && (c === ',' || c === ';' || c === '\n')) {
      flush()
      continue
    }
    chunk += c
  }
  throw new Error('unbalanced object literal')
}

function entriesOf(value: string): Entry[] {
  const i = value.indexOf('{')
  return i === -1 ? [] : topLevelEntries(value, i, true).entries
}

export interface ParsedTypes {
  /** table or view -> column -> TS type text */
  relations: Record<string, Record<string, string>>
  /** function -> arg names */
  functions: Record<string, string[]>
}

export function parseDatabaseType(source: string): ParsedTypes {
  const dbStart = source.indexOf('export type Database')
  const publicIdx = source.indexOf('public:', dbStart)
  const publicBlock = topLevelEntries(source, source.indexOf('{', publicIdx), true).entries
  const section = (name: string) => entriesOf(publicBlock.find((e) => e.key === name)?.value ?? '')

  const relations: ParsedTypes['relations'] = {}
  for (const rel of [...section('Tables'), ...section('Views')]) {
    const row = entriesOf(rel.value).find((e) => e.key === 'Row')
    if (!row) continue
    relations[rel.key] = Object.fromEntries(entriesOf(row.value).map((c) => [c.key, c.value]))
  }

  const functions: ParsedTypes['functions'] = {}
  for (const fn of section('Functions')) {
    const args = entriesOf(fn.value).find((e) => e.key === 'Args')
    functions[fn.key] = args ? entriesOf(args.value).map((a) => a.key) : []
  }
  return { relations, functions }
}

export interface RpcCallSite {
  name: string
  keys: string[]
  where: string
}

/** Finds every `.rpc('literal', { ... })` call; dynamic names are not matched. */
export function parseRpcCallSites(source: string, file: string): RpcCallSite[] {
  const sites: RpcCallSite[] = []
  const re = /\.rpc\(\s*['"]([A-Za-z_]\w*)['"]\s*(?:as\s+\w+\s*)?(,|\))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    const line = source.slice(0, m.index).split('\n').length
    let keys: string[] = []
    if (m[2] === ',') {
      const brace = source.slice(re.lastIndex).search(/\S/) + re.lastIndex
      if (source[brace] === '{') keys = topLevelEntries(source, brace, false).entries.map((e) => e.key)
    }
    sites.push({ name: m[1], keys, where: `${file}:${line}` })
  }
  return sites
}

export function collectRpcCallSites(rootDir: string): RpcCallSite[] {
  const out: RpcCallSite[] = []
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(ent.name)) {
        out.push(...parseRpcCallSites(fs.readFileSync(p, 'utf8'), path.relative(rootDir, p).replace(/\\/g, '/')))
      }
    }
  }
  walk(rootDir)
  return out
}

type Category = 'string' | 'number' | 'boolean' | 'array' | 'json' | 'any'

/** Which PostgREST categories a TS column type may be backed by. */
export function tsCategories(tsType: string): Category[] {
  const t = tsType
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p && p !== 'null' && p !== 'undefined')
  if (t.length === 0 || t.includes('unknown') || t.includes('any')) return ['any']
  if (t.every((p) => p === 'string' || /^'[^']*'$/.test(p))) return ['string']
  if (t.every((p) => p === 'number')) return ['number']
  if (t.every((p) => p === 'boolean')) return ['boolean']
  if (t.every((p) => p.endsWith('[]') || p.startsWith('Array<'))) return ['array', 'json']
  return ['json']
}

export interface OpenApiProperty {
  type?: string
  format?: string
}

export function pgCategory(prop: OpenApiProperty): Category {
  if (prop.format === 'json' || prop.format === 'jsonb') return 'json'
  switch (prop.type) {
    case 'boolean':
      return 'boolean'
    case 'integer':
    case 'number':
      return 'number'
    case 'array':
      return 'array'
    case 'string':
      return 'string'
    default:
      return 'any'
  }
}

export interface OpenApiDoc {
  definitions?: Record<string, { properties?: Record<string, OpenApiProperty> }>
  paths?: Record<
    string,
    Record<string, { parameters?: Array<{ in?: string; name?: string; schema?: { properties?: Record<string, unknown> } }> }>
  >
}

function rpcArgNames(doc: OpenApiDoc, fn: string): string[] | null {
  const p = doc.paths?.[`/rpc/${fn}`]
  if (!p) return null
  const names = new Set<string>()
  for (const op of Object.values(p)) {
    for (const param of op.parameters ?? []) {
      if (param.in === 'body') Object.keys(param.schema?.properties ?? {}).forEach((k) => names.add(k))
      // GET exposes args as query params (in: query, name: <arg>).
      else if (param.in === 'query' && param.name) names.add(param.name)
    }
  }
  return [...names]
}

/** Returns one human-readable line per mismatch; empty means the contract holds. */
export function checkContract(types: ParsedTypes, calls: RpcCallSite[], doc: OpenApiDoc): string[] {
  const problems: string[] = []
  for (const [rel, cols] of Object.entries(types.relations)) {
    const def = doc.definitions?.[rel]
    if (!def) {
      problems.push(`relation ${rel} is missing`)
      continue
    }
    for (const [col, tsType] of Object.entries(cols)) {
      const prop = def.properties?.[col]
      if (!prop) {
        problems.push(`column ${rel}.${col} is missing`)
        continue
      }
      const want = tsCategories(tsType)
      const got = pgCategory(prop)
      if (!want.includes('any') && got !== 'any' && !want.includes(got)) {
        problems.push(`column ${rel}.${col}: TS \`${tsType}\` but DB is ${prop.format ?? prop.type}`)
      }
    }
  }

  const required: Array<{ name: string; keys: string[]; where: string }> = [
    ...Object.entries(types.functions).map(([name, keys]) => ({ name, keys, where: 'src/lib/supabase.ts Functions' })),
    ...calls,
  ]
  for (const { name, keys, where } of required) {
    const args = rpcArgNames(doc, name)
    if (!args) {
      problems.push(`rpc ${name} is missing (${where})`)
      continue
    }
    // Subset, not equality: defaulted params are legal to omit.
    const unknown = keys.filter((k) => !args.includes(k))
    if (unknown.length) problems.push(`rpc ${name}: no parameter named ${unknown.join(', ')} (${where}); DB has ${args.join(', ') || 'none'}`)
  }
  return problems
}
