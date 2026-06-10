/**
 * Minimaler Markdown→HTML-Renderer — geteilt zwischen KI-Chat und Handbuch.
 * Bewusst ohne Library-Dependency. Gibt einen HTML-String zurück; der Aufrufer
 * ist für `DomSanitizer.bypassSecurityTrustHtml` verantwortlich.
 *
 * Unterstützt: `inline code`, Links (`[t](url)` — interne `/…`-Routen bekommen
 * `.md-link-internal` für Router-Interception, externe `.md-link`),
 * **bold**, *italic*, _italic_, ungeordnete/geordnete Listen, Tabellen mit
 * Pipe-Syntax, Headings (#…####), eingezäunte Code-Blöcke.
 */
export function markdownToHtml(src: string): string {
  const esc = src
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const h = esc
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    // Bilder ![alt](url) — MUSS vor dem Link-Replace stehen (Image-Syntax
    // enthaelt die Link-Syntax). Nur http(s)-Quellen zulassen.
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (_m, alt, u) =>
      `<img src="${String(u).replace(/"/g, '%22')}" alt="${alt}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => {
      const url = String(u).replace(/"/g, '%22');
      return url.startsWith('/')
        ? `<a href="${url}" class="md-link-internal">${t}</a>`
        : `<a href="${url}" target="_blank" rel="noopener" class="md-link">${t}</a>`;
    })
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<![*\w])\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/(?<![_\w])_([^_\n]+)_(?!_)/g, '<em>$1</em>');

  const lines = h.split(/\n/);
  const out: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  const closeList = () => { if (inList) { out.push(`</${inList}>`); inList = null; } };

  const isTableRow = (s: string) => /^\s*\|.*\|\s*$/.test(s);
  const isTableSeparator = (s: string) => /^\s*\|[\s:|-]+\|\s*$/.test(s);
  const isCodeFence = (s: string) => /^\s*```/.test(s);
  const splitRow = (s: string) => s.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();

    if (isCodeFence(line)) {
      const inner: string[] = [];
      i++;
      while (i < lines.length && !isCodeFence(lines[i])) { inner.push(lines[i]); i++; }
      i++; // closing fence
      const hasTable = inner.some((l) => isTableRow(l)) && inner.some((l) => isTableSeparator(l));
      if (hasTable) { lines.splice(i, 0, ...inner); continue; }
      closeList();
      out.push(`<pre><code>${inner.join('\n')}</code></pre>`);
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      closeList();
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i]) && !isTableSeparator(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push('<table><thead><tr>' + header.map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>');
      for (const r of rows) out.push('<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>');
      out.push('</tbody></table>');
      continue;
    }

    const ul = line.match(/^[-*]\s+(.*)$/);
    const ol = line.match(/^(\d+)\.\s+(.*)$/);
    const hd = line.match(/^(#{1,4})\s+(.*)$/);
    if (ul) {
      if (inList !== 'ul') { closeList(); out.push('<ul>'); inList = 'ul'; }
      out.push(`<li>${ul[1]}</li>`);
    } else if (ol) {
      if (inList !== 'ol') { closeList(); out.push('<ol>'); inList = 'ol'; }
      out.push(`<li>${ol[2]}</li>`);
    } else if (hd) {
      closeList();
      const level = Math.min(hd[1].length + 2, 6);
      out.push(`<h${level}>${hd[2]}</h${level}>`);
    } else if (line.trim()) {
      closeList();
      out.push(`<p>${line}</p>`);
    }
    i++;
  }
  closeList();
  return out.join('');
}
