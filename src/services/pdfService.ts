import type { PdfRun, SimplePdfRun, SimplePdfImageRun, SimplePdfLineRun, SimplePdfRectRun } from '../types';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

export const SIMPLE_PDF_PAGE = {
  width: PAGE_WIDTH,
  height: PAGE_HEIGHT,
};

function sanitizeText(text: string): string {
  const replaceMap: Record<string, string> = {
    '\u2013': '-', '\u2014': '-', '\u2212': '-', '\u2022': '*', '\u00B0': ' deg',
    '\u00B7': '-', '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"',
    '\u2026': '...', '\u00A0': ' ', '\u00B2': '2',
  };
  text = text.replace(/[\u2013\u2014\u2212\u2022\u00B0\u00B7\u2018\u2019\u201C\u201D\u2026\u00A0\u00B2]/g, (m) => replaceMap[m] || '?');
  return text
    .replace(/[\r\n]+/g, ' ')
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0);
      if (char === '\\' || char === '(' || char === ')') return `\\${char}`;
      if (code < 32 || code > 126) return '?';
      return char;
    })
    .join('');
}

const colorString = (color: [number, number, number]) =>
  `${Math.min(1, Math.max(0, color[0])).toFixed(2)} ${Math.min(1, Math.max(0, color[1])).toFixed(2)} ${Math.min(1, Math.max(0, color[2])).toFixed(2)}`;

export function createSimplePdfFromPages(pages: PdfRun[][]): Blob {
  const pageObjects: string[] = [];
  const contentsObjects: string[] = [];
  
  pages.forEach((runs, pageIndex) => {
    const contentLines = runs.map((run) => {
      if ('kind' in run && run.kind === 'image') {
        // Image handling would go here, simplified for now
        return '';
      } else if ('kind' in run && run.kind === 'line') {
        const ln = run as SimplePdfLineRun;
        const w = (ln.width ?? 1).toFixed(2);
        const color = ln.color
          ? colorString(ln.color)
          : (() => {
              const g = Math.max(0, Math.min(1, ln.gray ?? 0));
              return `${g.toFixed(2)} ${g.toFixed(2)} ${g.toFixed(2)}`;
            })();
        return `q ${color} RG ${w} w ${ln.x1.toFixed(2)} ${ln.y1.toFixed(2)} m ${ln.x2.toFixed(2)} ${ln.y2.toFixed(2)} l S Q`;
      } else if ('kind' in run && run.kind === 'rect') {
        const rect = run as SimplePdfRectRun;
        const commands: string[] = ['q'];
        if (rect.fill) commands.push(`${colorString(rect.fill)} rg`);
        if (rect.stroke) commands.push(`${colorString(rect.stroke)} RG`);
        if (rect.strokeWidth) commands.push(`${rect.strokeWidth.toFixed(2)} w`);
        commands.push(`${rect.x.toFixed(2)} ${rect.y.toFixed(2)} ${rect.width.toFixed(2)} ${rect.height.toFixed(2)} re`);
        if (rect.fill && rect.stroke) commands.push('B');
        else if (rect.fill) commands.push('f');
        else if (rect.stroke) commands.push('S');
        commands.push('Q');
        return commands.join(' ');
      } else {
        const tr = run as SimplePdfRun;
        const font = tr.font === 'bold' ? '/F2' : '/F1';
        const size = (tr.size ?? 12).toFixed(2);
        const x = tr.x.toFixed(2);
        const y = tr.y.toFixed(2);
        const text = sanitizeText(tr.text);
        const color = colorString(tr.color ?? [0, 0, 0]);
        return `${color} rg\nBT ${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${text}) Tj ET`;
      }
    });
    const stream = contentLines.join('\n');
    const streamLength = new TextEncoder().encode(stream).length;
    contentsObjects.push(`<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`);
    
    // The object index for a page's content stream is 3 (Catalog, Pages Root) + number of pages + the current page's index.
    const contentStreamObjIndex = 3 + pages.length + pageIndex;
    
    pageObjects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)}] /Contents ${contentStreamObjIndex} 0 R /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R /F2 ${3 + pages.length * 2 + 1} 0 R >> >> >>`,
    );
  });

  const objects: string[] = [];
  // 1: Catalog
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  // 2: Pages Root
  const kids = pageObjects.map((_, i) => `${i + 3} 0 R`).join(' ');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageObjects.length} >>`);
  // 3...: Page Objects
  objects.push(...pageObjects);
  // ...: Content Stream Objects
  objects.push(...contentsObjects);
  // ...: Font Objects
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach((body, index) => {
    offsets[index + 1] = pdf.length;
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${offsets[i].toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  
  return new Blob([pdf], { type: 'application/pdf' });
}
