import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';

/**
 * Read-only Anzeige des `Customer.customFields` JSON-Objects.
 * Rendert als kompakte Definition-List (key: value pro Zeile).
 * Wird leer wenn keine Felder vorhanden — Parent zeigt dann gar nichts.
 */
@Component({
  selector: 'app-custom-fields-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <dl *ngIf="entries.length" class="cf-view">
      <ng-container *ngFor="let e of entries">
        <dt>{{ e.key }}</dt>
        <dd>{{ e.value }}</dd>
      </ng-container>
    </dl>
  `,
  styles: [`
    .cf-view {
      margin: 0;
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 4px 12px;
      font-family: system-ui, sans-serif;
      font-size: 0.92rem;
    }
    dt {
      font-weight: 600;
      color: #4a4a4a;
      &::after { content: ':'; }
    }
    dd { margin: 0; color: #1a1a1a; }
  `],
})
export class CustomFieldsViewComponent implements OnChanges {
  @Input() customFields: string = '{}';
  entries: { key: string; value: string }[] = [];

  ngOnChanges() {
    if (!this.customFields) {
      this.entries = [];
      return;
    }
    try {
      const obj = JSON.parse(this.customFields);
      if (!obj || typeof obj !== 'object') {
        this.entries = [];
        return;
      }
      this.entries = Object.entries(obj).map(([key, value]) => ({
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      }));
    } catch {
      this.entries = [];
    }
  }
}
