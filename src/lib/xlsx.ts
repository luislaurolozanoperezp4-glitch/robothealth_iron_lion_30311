// Lector mínimo de Excel .xlsx/.xlsm: devuelve la primera hoja con datos como filas de valores.
import type { ZipEntries } from './zip';

const utf8 = new TextDecoder();

const unescapeXml = (s: string) =>
  s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'amp') return '&';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  });

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
};

async function text(entries: ZipEntries, path: string): Promise<string | null> {
  const get = entries.get(path);
  return get ? utf8.decode(await get()) : null;
}

/** Índices de estilo (s="…") cuyo formato numérico es fecha/hora. */
function dateStyles(stylesXml: string | null): Set<number> {
  const out = new Set<number>();
  if (!stylesXml) return out;
  const custom = new Map<number, string>();
  for (const m of stylesXml.matchAll(/<numFmt\b[^>]*>/g)) {
    const id = attr(m[0], 'numFmtId');
    const code = attr(m[0], 'formatCode');
    if (id && code) custom.set(+id, unescapeXml(code));
  }
  const isDateFmt = (id: number) => {
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) return true;
    const code = custom.get(id);
    if (!code) return false;
    return /[dmyhs]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, ''));
  };
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml);
  if (xfs) {
    let i = 0;
    for (const m of xfs[1].matchAll(/<xf\b[^>]*>/g)) {
      if (isDateFmt(+(attr(m[0], 'numFmtId') ?? 0))) out.add(i);
      i++;
    }
  }
  return out;
}

function colIndex(ref: string): number {
  let c = 0;
  for (let i = 0; i < ref.length; i++) {
    const code = ref.charCodeAt(i);
    if (code < 65 || code > 90) break;
    c = c * 26 + (code - 64);
  }
  return c - 1;
}

function parseSheet(xml: string, shared: string[], dates: Set<number>): unknown[][] {
  const rows: unknown[][] = [];
  let r = -1;
  let c = -1;
  const re = /<row\b([^>]*?)(\/?)>|<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) {
      const rAttr = attr(m[1], 'r');
      r = rAttr ? +rAttr - 1 : r + 1;
      c = -1;
      continue;
    }
    const attrs = m[3];
    const inner = m[4] ?? '';
    const ref = attr(attrs, 'r');
    c = ref ? colIndex(ref) : c + 1;
    if (ref) {
      const rr = +ref.replace(/^[A-Z]+/, '') - 1;
      if (Number.isFinite(rr)) r = rr;
    }
    if (r < 0) r = 0;
    const type = attr(attrs, 't');
    const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
    let value: unknown = null;
    if (type === 's') value = vMatch ? shared[+vMatch[1]] ?? null : null;
    else if (type === 'inlineStr') value = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => unescapeXml(x[1])).join('');
    else if (type === 'str') value = vMatch ? unescapeXml(vMatch[1]) : null;
    else if (type === 'b') value = vMatch ? vMatch[1] === '1' : null;
    else if (type === 'e') value = null;
    else if (vMatch) {
      let v = +vMatch[1];
      const s = attr(attrs, 's');
      if (s && dates.has(+s)) {
        // Fecha de Excel: días desde 1899-12-30. Solo hora (<1 día) → segundos del día.
        v = v < 1 ? v * 86400 : Math.round((v - 25569) * 86400000);
      }
      value = v;
    }
    (rows[r] ??= [])[c] = value;
  }
  // Rellenar filas vacías intermedias y quitar las iniciales.
  const out: unknown[][] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((v) => v == null || v === '')) {
      if (out.length) out.push([]);
      continue;
    }
    out.push(Array.from(row, (v) => (v === undefined ? null : v)));
  }
  return out;
}

export async function readXlsx(entries: ZipEntries): Promise<unknown[][]> {
  const [workbook, rels, sharedXml, stylesXml] = await Promise.all([
    text(entries, 'xl/workbook.xml'),
    text(entries, 'xl/_rels/workbook.xml.rels'),
    text(entries, 'xl/sharedStrings.xml'),
    text(entries, 'xl/styles.xml'),
  ]);
  if (!workbook) throw new Error('This ZIP file is not an Excel workbook.');

  const shared: string[] = [];
  if (sharedXml) {
    for (const si of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push([...si[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => unescapeXml(x[1])).join(''));
    }
  }
  const dates = dateStyles(stylesXml);

  // Hojas en el orden del libro.
  const targets = new Map<string, string>();
  for (const m of (rels ?? '').matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }
  const sheetPaths: string[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const id = attr(m[0], 'r:id');
    const path = id && targets.get(id);
    if (path) sheetPaths.push(path);
  }
  if (sheetPaths.length === 0) sheetPaths.push(...[...entries.keys()].filter((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k)).sort());

  for (const path of sheetPaths) {
    const xml = await text(entries, path);
    if (!xml) continue;
    const rows = parseSheet(xml, shared, dates);
    if (rows.length >= 2) return rows;
  }
  throw new Error('The Excel workbook has no sheet with data.');
}
