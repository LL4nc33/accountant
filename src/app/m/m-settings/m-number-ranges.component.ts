import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { NumberRange, numberRangeTypes } from '../../../shared/entities/number-range';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

@Component({
  selector: 'm-number-ranges',
  standalone: true,
  imports: [CommonModule, FormsModule, MFormSectionComponent],
  template: `
    <p *ngIf="loading" class="m-muted">Lädt …</p>
    <p *ngIf="!loading" class="m-muted-small" style="margin-bottom: 1rem;">
      Format-Platzhalter: <code>{{ '{{' }}NUMBER{{ '}}' }}</code>, <code>{{ '{{' }}pad 4 NUMBER{{ '}}' }}</code>, <code>{{ '{{' }}YYYY{{ '}}' }}</code>
    </p>

    <m-form-section *ngFor="let r of ranges" [title]="r.numberRangeType || '—'">
      <label class="m-field">
        <span>Nächste Nummer</span>
        <input type="number" min="1" [(ngModel)]="r.nextSequenceValue" [name]="'next_' + r.id" inputmode="numeric" />
      </label>
      <label class="m-field">
        <span>Format</span>
        <input type="text" [(ngModel)]="r.format" [name]="'format_' + r.id" />
      </label>
      <div class="m-form-actions">
        <button type="button" class="m-pill m-pill-primary" (click)="save(r)" [disabled]="savingId === r.id">
          {{ savingId === r.id ? 'Speichert…' : 'Speichern' }}
        </button>
      </div>
    </m-form-section>
  `,
  styleUrls: ['../m-expenses/m-expense-edit.component.scss', '../m-crm/m-customer-view.component.scss'],
})
export class MNumberRangesComponent implements OnInit {
  loading = true;
  ranges: NumberRange[] = [];
  savingId: string | null = null;

  constructor(private toastr: ToastrService) {}

  async ngOnInit() {
    const all = await remult.repo(NumberRange).find();
    const order = new Map(numberRangeTypes.map((t, i) => [t, i]));
    this.ranges = all.sort((a, b) => (order.get(a.numberRangeType!) ?? 99) - (order.get(b.numberRangeType!) ?? 99));
    this.loading = false;
  }

  async save(r: NumberRange) {
    this.savingId = r.id;
    try {
      await remult.repo(NumberRange).save(r);
      this.toastr.success(`${r.numberRangeType} gespeichert`);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.savingId = null;
    }
  }
}
