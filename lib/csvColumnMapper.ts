/**
 * Auto-detector de colunas CSV para impressoras Konica Minolta.
 *
 * Analisa cabeçalho e valores para mapear colunas mesmo quando
 * o formato varia entre modelos (C300i, C3300i, etc.).
 */

export interface ColumnMapping {
  ip: string;
  serial: string;
  modelo: string;
  dataHora: string;
  paginasTotal: string;
  paginasPB: string;
  paginasColor: string;
  status: string;
}

interface ColumnStats {
  name: string;
  min: number;
  max: number;
  avg: number;
  zeroCount: number;
  nonZeroCount: number;
  uniqueValues: Set<number>;
}

/**
 * Detecta o mapeamento de colunas automaticamente a partir do conteúdo CSV.
 */
export function detectColumnMapping(
  headers: string[],
  sampleRows: Record<string, unknown>[]
): ColumnMapping {
  const normalized = headers.map((h) => ({
    original: h,
    lower: h.toLowerCase().replace(/[^a-z0-9_]/g, ''),
  }));

  const mapping: ColumnMapping = {
    ip: findColumn(normalized, ['ip', 'enderecoip', 'endereco_ip', 'networkip']) || '',
    serial: findColumn(normalized, ['serial', 'sn', 'numerodeserie', 'numero_serie', 'serie']) || '',
    modelo: findColumn(normalized, ['modelo', 'model', 'device', 'equipamento', 'printer']) || '',
    dataHora:
      findColumn(normalized, [
        'data',
        'datahora',
        'data_hora',
        'datetime',
        'date',
        'timestamp',
        'horario',
      ]) || '',
    paginasTotal: '',
    paginasPB: '',
    paginasColor: '',
    status: findColumn(normalized, ['status', 'estado', 'situacao', 'state']) || '',
  };

  // Exclui exatamente as colunas já mapeadas como metadados textuais
  const excludedOriginals = new Set(
    [mapping.ip, mapping.serial, mapping.modelo, mapping.dataHora, mapping.status].filter(Boolean)
  );

  const numericCandidates = normalized.filter((h) => {
    if (excludedOriginals.has(h.original)) {
      return false;
    }
    return sampleRows.some((row) => {
      const v = row[h.original];
      return v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v));
    });
  });

  if (numericCandidates.length === 0) {
    mapping.paginasTotal =
      findColumn(normalized, ['paginas_total', 'total', 'pagtotal']) || 'Paginas_Total';
    mapping.paginasPB =
      findColumn(normalized, ['paginas_pb', 'pb', 'preto', 'bw', 'p&b', 'pagpb']) || 'Paginas_PB';
    mapping.paginasColor =
      findColumn(normalized, ['paginas_color', 'color', 'cor', 'colour', 'pagcolor']) ||
      'Paginas_Color';
    return mapping;
  }

  const stats = numericCandidates.map((h) => computeColumnStats(h.original, sampleRows));

  if (stats.length >= 3) {
    assignThreeColumns(stats, mapping);
  } else if (stats.length === 2) {
    assignTwoColumns(stats, mapping);
  } else if (stats.length === 1) {
    mapping.paginasTotal = stats[0].name;
    mapping.paginasPB = '';
    mapping.paginasColor = '';
  }

  return mapping;
}

function assignThreeColumns(stats: ColumnStats[], mapping: ColumnMapping): void {
  const sorted = [...stats].sort((a, b) => b.avg - a.avg);

  const byName = matchByName(stats, mapping);
  if (byName) return;

  mapping.paginasTotal = sorted[0].name;

  const smaller = sorted.slice(1);
  if (smaller[0].zeroCount > smaller[1].zeroCount) {
    mapping.paginasPB = smaller[0].name;
    mapping.paginasColor = smaller[1].name;
  } else if (smaller[1].zeroCount > smaller[0].zeroCount) {
    mapping.paginasPB = smaller[1].name;
    mapping.paginasColor = smaller[0].name;
  } else {
    mapping.paginasPB = smaller[1].name;
    mapping.paginasColor = smaller[0].name;
  }

  validateMapping(stats, mapping);
}

function assignTwoColumns(stats: ColumnStats[], mapping: ColumnMapping): void {
  const byName = matchByName(stats, mapping);
  if (byName) return;

  const sorted = [...stats].sort((a, b) => b.avg - a.avg);
  mapping.paginasTotal = sorted[0].name;
  mapping.paginasColor = sorted[1].name;
  mapping.paginasPB = '';
}

function matchByName(stats: ColumnStats[], mapping: ColumnMapping): boolean {
  const totalPatterns = ['paginas_total', 'total', 'pagtotal', 'totalpages', 'total_pages'];
  const pbPatterns = ['paginas_pb', 'pb', 'preto', 'bw', 'p&b', 'pagpb', 'black', 'mono'];
  const colorPatterns = ['paginas_color', 'color', 'cor', 'colour', 'pagcolor', 'cmyk'];

  let foundTotal = false;
  let foundPB = false;
  let foundColor = false;

  for (const s of stats) {
    const lower = s.name.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!foundTotal && totalPatterns.some((p) => lower.includes(p))) {
      mapping.paginasTotal = s.name;
      foundTotal = true;
    } else if (!foundPB && pbPatterns.some((p) => lower.includes(p))) {
      mapping.paginasPB = s.name;
      foundPB = true;
    } else if (!foundColor && colorPatterns.some((p) => lower.includes(p))) {
      mapping.paginasColor = s.name;
      foundColor = true;
    }
  }

  return foundTotal || foundPB || foundColor;
}

function validateMapping(stats: ColumnStats[], mapping: ColumnMapping): void {
  const totalS = stats.find((s) => s.name === mapping.paginasTotal);
  const pbS = stats.find((s) => s.name === mapping.paginasPB);
  const colorS = stats.find((s) => s.name === mapping.paginasColor);

  if (!totalS || !pbS || !colorS) return;

  const allRowsInvalid = totalS.max > 0 && pbS.avg + colorS.avg > totalS.avg * 1.1;

  if (allRowsInvalid) {
    if (pbS.avg > totalS.avg && pbS.avg >= colorS.avg) {
      const tmpName = mapping.paginasTotal;
      mapping.paginasTotal = mapping.paginasPB;
      mapping.paginasPB = tmpName;
    } else if (colorS.avg > totalS.avg && colorS.avg >= pbS.avg) {
      const tmpName = mapping.paginasTotal;
      mapping.paginasTotal = mapping.paginasColor;
      mapping.paginasColor = tmpName;
    }
  }
}

function findColumn(
  normalized: { original: string; lower: string }[],
  patterns: string[]
): string | null {
  for (const n of normalized) {
    if (patterns.some((p) => n.lower === p || n.lower.includes(p))) {
      return n.original;
    }
  }
  return null;
}

function computeColumnStats(colName: string, rows: Record<string, unknown>[]): ColumnStats {
  const values: number[] = [];
  let zeroCount = 0;

  for (const row of rows) {
    const raw = row[colName];
    const num = Number(raw);
    if (!Number.isNaN(num)) {
      values.push(num);
      if (num === 0) zeroCount++;
    }
  }

  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  return {
    name: colName,
    min,
    max,
    avg,
    zeroCount,
    nonZeroCount: values.length - zeroCount,
    uniqueValues: new Set(values),
  };
}

export function detectCsvSeparator(content: string): string {
  const firstLine = content.split('\n')[0] || '';
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  if (semicolons >= commas && semicolons >= tabs) return ';';
  if (commas >= semicolons && commas >= tabs) return ',';
  return '\t';
}

export function logMapping(mapping: ColumnMapping, fileName: string): void {
  console.log(`[CSV Mapper] Arquivo: ${fileName}`);
  console.log(`[CSV Mapper] IP: ${mapping.ip}`);
  console.log(`[CSV Mapper] Serial: ${mapping.serial}`);
  console.log(`[CSV Mapper] Modelo: ${mapping.modelo}`);
  console.log(`[CSV Mapper] Data: ${mapping.dataHora}`);
  console.log(`[CSV Mapper] Total: ${mapping.paginasTotal}`);
  console.log(`[CSV Mapper] PB: ${mapping.paginasPB}`);
  console.log(`[CSV Mapper] Color: ${mapping.paginasColor}`);
  console.log(`[CSV Mapper] Status: ${mapping.status}`);
}
