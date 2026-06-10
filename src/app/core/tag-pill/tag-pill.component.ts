import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { remult } from 'remult';
import { Tag } from '../../../shared/entities/tag';

/**
 * Zeigt eine Liste von Tag-IDs als farbige Pills.
 * Erwartet `tagIds` als Semikolon-getrennte String-Liste (Customer.tagIds-Format).
 * Lädt Tag-Details einmalig aus dem repo + cached sie pro Component-Instanz.
 */
@Component({
  selector: 'app-tag-pill',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span *ngFor="let t of resolved" class="tag-pill" [style.background]="t.color" [style.color]="contrast(t.color)">
      {{ t.name }}
    </span>
  `,
  styles: [`
    .tag-pill {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      margin-right: 4px;
      margin-bottom: 2px;
      letter-spacing: 0.02em;
    }
  `],
})
export class TagPillComponent implements OnChanges {
  @Input() tagIds: string = '';
  resolved: Tag[] = [];

  async ngOnChanges() {
    const ids = (this.tagIds ?? '').split(';').map((s) => s.trim()).filter(Boolean);
    if (!ids.length) {
      this.resolved = [];
      return;
    }
    try {
      const all = await remult.repo(Tag).find({ where: { id: ids } });
      const map = new Map(all.map((t) => [t.id, t]));
      // Reihenfolge aus tagIds beibehalten
      this.resolved = ids.map((id) => map.get(id)).filter(Boolean) as Tag[];
    } catch {
      this.resolved = [];
    }
  }

  /** Liefert Schwarz oder Weiß als bester Kontrast zu beliebiger HEX-Farbe. */
  contrast(hex: string): string {
    if (!hex || !hex.startsWith('#') || hex.length < 7) return '#1a1a1a';
    const r = parseInt(hex.substring(1, 3), 16);
    const g = parseInt(hex.substring(3, 5), 16);
    const b = parseInt(hex.substring(5, 7), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.55 ? '#1a1a1a' : '#ffffff';
  }
}
