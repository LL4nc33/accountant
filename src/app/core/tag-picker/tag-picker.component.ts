import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { remult } from 'remult';
import { Tag } from '../../../shared/entities/tag';

/**
 * Multi-Select-Picker für Tags. Operiert auf einem Semikolon-getrennten
 * tagIds-String — analog zum `Customer.tagIds`-Feld.
 *
 * Features:
 *  - Pills mit X-Button zum Entfernen
 *  - Drop-down für nicht-gewählte Tags
 *  - Inline-Neu-anlegen via Eingabe-Feld + Plus-Button
 */
@Component({
  selector: 'app-tag-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="tag-picker">
      <div class="selected">
        <span *ngFor="let t of selectedTags" class="tag-chip"
          [style.background]="t.color" [style.color]="contrast(t.color)">
          {{ t.name }}
          <button type="button" class="x" (click)="remove(t.id)" aria-label="Entfernen">×</button>
        </span>
        <span *ngIf="!selectedTags.length" class="muted">— keine Tags —</span>
      </div>
      <div class="add-row">
        <select [(ngModel)]="addPick" (change)="addById(addPick); addPick = ''">
          <option value="">Tag hinzufügen…</option>
          <option *ngFor="let t of availableTags" [value]="t.id">{{ t.name }}</option>
        </select>
        <input type="text" placeholder="oder neuen Tag tippen" [(ngModel)]="newName"
          (keydown.enter)="createNew(); $event.preventDefault()" maxlength="40" />
        <input type="color" [(ngModel)]="newColor" title="Farbe" />
        <button type="button" class="btn btn-sm" (click)="createNew()" [disabled]="!newName.trim()">
          + Neu
        </button>
      </div>
    </div>
  `,
  styles: [`
    .tag-picker { font-family: system-ui, sans-serif; }
    .selected { min-height: 28px; padding: 4px; margin-bottom: 0.5rem; border: 1px dashed #ccc; border-radius: 4px; }
    .muted { color: #888; font-size: 0.85rem; padding: 4px 6px; }
    .tag-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 2px 4px 2px 10px;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
      margin: 2px;
      .x {
        background: transparent;
        border: none;
        color: inherit;
        opacity: 0.75;
        cursor: pointer;
        font-size: 1rem;
        line-height: 1;
        padding: 0 6px;
        &:hover { opacity: 1; }
      }
    }
    .add-row {
      display: flex;
      gap: 0.4rem;
      align-items: center;
      flex-wrap: wrap;
      select, input[type=text] {
        padding: 4px 8px;
        border: 1px solid #ccc;
        border-radius: 3px;
        font-size: 0.9rem;
      }
      input[type=color] {
        height: 30px;
        width: 36px;
        border: 1px solid #ccc;
        border-radius: 3px;
        padding: 1px;
      }
    }
  `],
})
export class TagPickerComponent implements OnInit {
  @Input() tagIds: string = '';
  @Output() tagIdsChange = new EventEmitter<string>();

  allTags: Tag[] = [];
  addPick = '';
  newName = '';
  newColor = '#888888';

  async ngOnInit() {
    await this.refresh();
  }

  async refresh() {
    this.allTags = await remult.repo(Tag).find({ where: { archived: false } });
  }

  get selectedIds(): string[] {
    return (this.tagIds ?? '').split(';').map((s) => s.trim()).filter(Boolean);
  }

  get selectedTags(): Tag[] {
    const map = new Map(this.allTags.map((t) => [t.id, t]));
    return this.selectedIds.map((id) => map.get(id)).filter(Boolean) as Tag[];
  }

  get availableTags(): Tag[] {
    const sel = new Set(this.selectedIds);
    return this.allTags.filter((t) => !sel.has(t.id));
  }

  remove(id: string) {
    const next = this.selectedIds.filter((x) => x !== id).join(';');
    this.tagIds = next;
    this.tagIdsChange.emit(next);
  }

  addById(id: string) {
    if (!id) return;
    if (this.selectedIds.includes(id)) return;
    const next = [...this.selectedIds, id].join(';');
    this.tagIds = next;
    this.tagIdsChange.emit(next);
  }

  async createNew() {
    const name = this.newName.trim();
    if (!name) return;
    const t = remult.repo(Tag).create();
    t.name = name;
    t.color = this.newColor || '#888888';
    const saved = await remult.repo(Tag).save(t);
    this.allTags = [...this.allTags, saved];
    this.addById(saved.id);
    this.newName = '';
    this.newColor = '#888888';
  }

  contrast(hex: string): string {
    if (!hex || !hex.startsWith('#') || hex.length < 7) return '#1a1a1a';
    const r = parseInt(hex.substring(1, 3), 16);
    const g = parseInt(hex.substring(3, 5), 16);
    const b = parseInt(hex.substring(5, 7), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.55 ? '#1a1a1a' : '#ffffff';
  }
}
