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

  // Mapeamento de campos fixos (IP, Serial, Modelo, Data, Status)
  const mapping: ColumnMapping = {
    ip: findColumn(normalized, ['ip', 'enderecoip', 'endereco_ip', 'networkip']) || '',
    serial: findColumn(normalized, ['serial', 'sn', 'numerodeserie', 'numero_serie', 'serie']) || '',
    modelo: findColumn(normalized, ['modelo', 'model', 'device', 'equipamento', 'printer']) || '',
    dataHora: findColumn(normalized, ['data', 'datahora', 'data_hora', 'datetime', 'date', 'timestamp', 'horario']) || '',
    paginasTotal: '',
    paginasPB: '',
    paginasColor: '',
    status: findColumn(normalized, ['status', 'estado', 'situacao', 'state']) || '',
  };

  // Colunas numéricas candidatas a Total/PB/Color
  const numericCandidates = normalized.filter((h) => {
    if (mapping.ip.includes(h.lower) || mapping.serial.includes(h.lower) ||
        mapping.modelo.includes(h.lower) || mapping.dataHora.includes(h.lower) ||
        mapping.status.includes(h.lower)) {
      return false;
    }
    // Verifica se tem algum valor numérico nas rows de exemplo
    return sampleRows.some((row) => {
      const v = row[h.original];
      return v !== null && v !== undefined && v !== '' && !isNaN(Number(v));
    });
  });

  if (numericCandidates.length === 0) {
    // Fallback: tenta nomes genéricos
    mapping.paginasTotal = findColumn(normalized, ['paginas_total', 'total', 'pagtotal']) || 'Paginas_Total';
    mapping.paginasPB = findColumn(normalized, ['paginas_pb', 'pb', 'preto', 'bw', 'p&b', 'pagpb']) || 'Paginas_PB';
    mapping.paginasColor = findColumn(normalized, ['paginas_color', 'color', 'cor', 'colour', 'pagcolor']) || 'Paginas_Color';
    return mapping;
  }

  // Calcula estatísticas por coluna numérica
  const stats = numericCandidates.map((h) => computeColumnStats(h.original, sampleRows));

  // Se temos 3+ colunas numéricas, usa heurísticas avançadas
  if (stats.length >= 3) {
    assignThreeColumns(stats, mapping);
  } else if (stats.length === 2) {
    assignTwoColumns(stats, mapping);
  } else if (stats.length === 1) {
    // Só 1 coluna numérica → assume que é Total, PB e Color ficam 0
    mapping.paginasTotal = stats[0].name;
    mapping.paginasPB = '';
    mapping.paginasColor = '';
  }

  return mapping;
}

/**
 * Mapeamento para 3 colunas numéricas: Total, PB, Color.
 */
function assignThreeColumns(stats: ColumnStats[], mapping: ColumnMapping): void {
  // Ordena por média decrescente (maior = provável Total)
  const sorted = [...stats].sort((a, b) => b.avg - a.avg);

  // Tenta匹配 por nome primeiro
  const byName = matchByName(stats, mapping);
  if (byName) return;

  // Heurística: maior valor = Total
  // Dos dois menores: o com mais zeros = PB (impressoras coloridas têm pouco PB)
  mapping.paginasTotal = sorted[0].name;

  const smaller = sorted.slice(1);
  // Se um tem muitos zeros e o outro não → o com zeros é PB
  if (smaller[0].zeroCount > smaller[1].zeroCount) {
    mapping.paginasPB = smaller[0].name;
    mapping.paginasColor = smaller[1].name;
  } else if (smaller[1].zeroCount > smaller[0].zeroCount) {
    mapping.paginasPB = smaller[1].name;
    mapping.paginasColor = smaller[0].name;
  } else {
    // Empate: assume que menor média = PB (geralmente menos PB que Color)
    mapping.paginasPB = smaller[1].name;
    mapping.paginasColor = smaller[0].name;
  }

  // Validação: PB + Color não deve ser >> Total
  validateMapping(stats, mapping);
}

/**
 * Mapeamento para 2 colunas numéricas.
 */
function assignTwoColumns(stats: ColumnStats[], mapping: ColumnMapping): void {
  const byName = matchByName(stats, mapping);
  if (byName) return;

  // Com 2 colunas, provavelmente é Total e (PB ou Color combinado)
  const sorted = [...stats].sort((a, b) => b.avg - a.avg);
  mapping.paginasTotal = sorted[0].name;
  // A segunda coluna pode ser PB ou Color; sem mais info, assume Color
  mapping.paginasColor = sorted[1].name;
  mapping.paginasPB = '';
}

/**
 * Tenta mapear por nomes de coluna conhecidos.
 */
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

/**
 * Valida se o mapeamento faz sentido (PB + Color <= Total aproximadamente).
 */
function validateMapping(stats: ColumnStats[], mapping: ColumnMapping): void {
  const totalS = stats.find((s) => s.name === mapping.paginasTotal);
  const pbS = stats.find((s) => s.name === mapping.paginasPB);
  const colorS = stats.find((s) => s.name === mapping.paginasColor);

  if (!totalS || !pbS || !colorS) return;

  // Se PB + Color > Total em todas as amostras, o mapeamento pode estar errado
  const allRowsInvalid = totalS.max > 0 &&
    pbS.avg + colorS.avg > totalS.avg * 1.1; // 10% de margem

  if (allRowsInvalid) {
    // Tenta trocar PB <-> Total: se PB é maior que Total, provavelmente PB é o Total real
    if (pbS.avg > totalS.avg && pbS.avg >= colorS.avg) {
      const tmpName = mapping.paginasTotal;
      mapping.paginasTotal = mapping.paginasPB;
      mapping.paginasPB = tmpName;
    }
    // Ou tenta trocar Color <-> Total
    else if (colorS.avg > totalS.avg && colorS.avg >= pbS.avg) {
      const tmpName = mapping.paginasTotal;
      mapping.paginasTotal = mapping.paginasColor;
      mapping.paginasColor = tmpName;
    }
  }
}

function findColumn(normalized: { original: string; lower: string }[], patterns: string[]): string | null {
  for (const n of normalized) {
    if (patterns.some((p) => n.lower.includes(p))) {
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
    if (!isNaN(num)) {
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

/**
 * Detecta automaticamente o separador do CSV (ponto e vírgula, vírgula ou tab).
 * Retorna o caractere real do separador (ex: '\t' é UM caractere ASCII 9).
 */
export function detectCsvSeparator(content: string): string {
  const firstLine = content.split('\n')[0] || '';
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  // Maioria vence; empate: ; > , > \t
  if (semicolons >= commas && semicolons >= tabs) return ';';
  if (commas >= semicolons && commas >= tabs) return ',';
  return '\t'; // caractere tab REAL (ASCII 9), não a string "\\t"
}

/**
 * Loga o mapeamento detectado para debugging.
 */
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
