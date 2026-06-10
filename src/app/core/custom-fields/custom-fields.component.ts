import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';

interface FieldRow {
  key: string;
  value: string;
}

/**
 * Editor für `Customer.customFields` — ein JSON-Object mit beliebigen
 * String-Key-Value-Paaren. Stringifiziert beim Emit zurück.
 *
 * UI: Zeilen-basiert. Pro Zeile Key-Input + Value-Input + Remove-Button.
 * Plus-Button hängt eine neue leere Zeile an. Beim Tippen wird automatisch
 * serialisiert — keine separate „Speichern"-Aktion in der Component
 * (das macht der Parent-Form).
 */
@Component({
  selector: 'app-custom-fields',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule],
  template: `
    <div class="cf-editor">
      <div *ngIf="rows.length === 0" class="muted">
        Keine Custom Fields. Plus-Button hinzufügen, z.B. „Vertragsende" → „2027-12-31".
      </div>
      <div *ngFor="let row of rows; let i = index" class="cf-row">
        <input class="cf-key" type="text" [(ngModel)]="row.key" placeholder="Schlüssel"
          (ngModelChange)="emit()" maxlength="64" />
        <input class="cf-value" type="text" [(ngModel)]="row.value" placeholder="Wert"
          (ngModelChange)="emit()" maxlength="500" />
        <button type="button" class="btn btn-sm btn-link cf-del"
          (click)="remove(i)" aria-label="Zeile entfernen" title="Entfernen">
          <cds-icon shape="trash" size="14"></cds-icon>
        </button>
      </div>
      <button type="button" class="btn btn-sm cf-add" (click)="add()">
        <cds-icon shape="plus"></cds-icon>
        Feld hinzufügen
      </button>
    </div>
  `,
  styles: [`
    .cf-editor { font-family: system-ui, sans-serif; }
    .muted { color: #888; font-size: 0.88rem; padding: 6px 0; }
    .cf-row {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin-bottom: 0.4rem;
      .cf-key, .cf-value {
        padding: 4px 8px;
        border: 1px solid #ccc;
        border-radius: 3px;
        font-size: 0.92rem;
        font-family: inherit;
      }
      .cf-key { width: 180px; }
      .cf-value { flex: 1; }
      .cf-del { color: #8b0000; padding: 0 0.4rem; }
    }
    .cf-add { margin-top: 0.3rem; }
  `],
})
export class CustomFieldsComponent implements OnChanges {
  @Input() customFields: string = '{}';
  @Output() customFieldsChange = new EventEmitter<string>();

  rows: FieldRow[] = [];

  ngOnChanges() {
    this.rows = this.parse(this.customFields);
  }

  private parse(raw: string): FieldRow[] {
    if (!raw) return [];
    try {
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return [];
      return Object.entries(obj).map(([key, value]) => ({
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      }));
    } catch {
      return [];
    }
  }

  add() {
    this.rows = [...this.rows, { key: '', value: '' }];
    this.emit();
  }

  remove(idx: number) {
    this.rows = this.rows.filter((_, i) => i !== idx);
    this.emit();
  }

  emit() {
    const obj: Record<string, string> = {};
    for (const row of this.rows) {
      const k = row.key.trim();
      if (!k) continue;
      obj[k] = row.value ?? '';
    }
    this.customFieldsChange.emit(JSON.stringify(obj));
  }
}
