import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { CashbookEntry, cashbookCategories } from '../../shared/entities/cashbook-entry';

@Component({
  selector: 'app-cashbook-edit',
  imports: [CommonModule, FormsModule, ClarityModule, RouterLink],
  template: `
    <main class="cb-edit" *ngIf="!loading && entry">
      <div class="page-head">
        <div class="page-head-text">
          <h1>{{ isNew ? 'Neuer Kassabuch-Eintrag' : 'Eintrag bearbeiten' }}</h1>
        </div>
        <div class="page-head-actions">
          <button *ngIf="!isNew" class="btn btn-outline btn-warning" type="button" (click)="toggleArchive()">
            {{ entry.archived ? 'Reaktivieren' : 'Archivieren' }}
          </button>
          <button class="btn btn-outline" type="button" (click)="cancel()">Abbrechen</button>
          <button class="btn btn-primary" type="button" (click)="save()" [disabled]="saving">{{ saving ? 'Speichert…' : 'Speichern' }}</button>
        </div>
      </div>

      <form clrForm clrLayout="horizontal" (ngSubmit)="save()">
        <clr-date-container>
          <label>Datum</label>
          <input type="date" clrDate name="entryDate" [(ngModel)]="entry.entryDate" />
        </clr-date-container>

        <clr-input-container>
          <label>Beleg-Nr.</label>
          <input clrInput name="documentNumber" [(ngModel)]="entry.documentNumber" placeholder="z.B. K-2026-001" />
        </clr-input-container>

        <clr-input-container>
          <label>Beschreibung</label>
          <input clrInput name="description" [(ngModel)]="entry.description" required />
        </clr-input-container>

        <clr-select-container>
          <label>Kategorie</label>
          <select clrSelect name="category" [(ngModel)]="entry.category">
            <option *ngFor="let c of categories" [value]="c">{{ c }}</option>
          </select>
        </clr-select-container>

        <clr-number-input-container>
          <label>Betrag brutto (EUR)</label>
          <input clrNumberInput type="number" step="0.01" name="amount" [(ngModel)]="entry.amount" />
          <clr-control-helper>Positiv = Einnahme · Negativ = Ausgabe</clr-control-helper>
        </clr-number-input-container>

        <clr-number-input-container>
          <label>USt-Satz (%)</label>
          <input clrNumberInput type="number" step="0.1" name="vatRate" [(ngModel)]="entry.vatRate" />
          <clr-control-helper>0 = USt-frei (Trinkgeld, Privatentnahme, …)</clr-control-helper>
        </clr-number-input-container>

        <div class="split-display" *ngIf="entry.vatRate > 0 && entry.amount !== 0">
          {{ entry.amount > 0 ? 'Einnahme' : 'Ausgabe' }} —
          Netto: <strong>{{ fmt(absNet(entry)) }} €</strong>
          · USt {{ entry.vatRate }}%: <strong>{{ fmt(absVat(entry)) }} €</strong>
        </div>

        <clr-textarea-container>
          <label>Bemerkungen</label>
          <textarea clrTextarea name="notes" [(ngModel)]="entry.notes" rows="3"></textarea>
        </clr-textarea-container>

        <clr-input-container>
          <label>Verknüpfte Rechnung-ID</label>
          <input clrInput name="linkedInvoiceId" [(ngModel)]="entry.linkedInvoiceId" placeholder="optional" />
        </clr-input-container>

        <clr-input-container>
          <label>Verknüpfte Expense-ID</label>
          <input clrInput name="linkedExpenseId" [(ngModel)]="entry.linkedExpenseId" placeholder="optional" />
        </clr-input-container>

        <button type="submit" hidden></button>
      </form>
    </main>
  `,
  styles: [`
    .cb-edit { max-width: 720px; }
    .split-display { padding: 0.5rem 0.75rem; background: #fafafa; border-left: 3px solid #318700;
      margin: 0.5rem 0; font-size: 0.92rem;
      strong { font-variant-numeric: tabular-nums; }
    }
  `],
})
export class CashbookEditComponent implements OnInit {
  entry?: CashbookEntry;
  loading = true;
  saving = false;
  isNew = false;
  categories = cashbookCategories;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private toastr: ToastrService,
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id === 'new' || !id) {
      this.entry = remult.repo(CashbookEntry).create();
      this.entry.entryDate = new Date();
      this.isNew = true;
    } else {
      const found = await remult.repo(CashbookEntry).findFirst({ id });
      if (!found) { this.router.navigate(['/cashbook']); return; }
      this.entry = found;
    }
    this.loading = false;
  }

  async save() {
    if (!this.entry) return;
    this.saving = true;
    try {
      this.entry = await remult.repo(CashbookEntry).save(this.entry);
      this.toastr.success('Eintrag gespeichert');
      this.router.navigate(['/cashbook']);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }

  cancel() { this.router.navigate(['/cashbook']); }
  async toggleArchive() {
    if (!this.entry) return;
    const willBeArchived = !this.entry.archived;
    this.entry.archived = willBeArchived;
    this.saving = true;
    try {
      this.entry = await remult.repo(CashbookEntry).save(this.entry);
      this.toastr.success(willBeArchived ? 'Eintrag archiviert' : 'Eintrag reaktiviert');
      this.router.navigate(['/cashbook']);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Aktion fehlgeschlagen');
    } finally { this.saving = false; }
  }

  absNet(e: CashbookEntry): number { return Math.abs(e.amountNet); }
  absVat(e: CashbookEntry): number { return Math.abs(e.vatAmount); }

  fmt(n: number | undefined): string {
    if (n === undefined || n === null) return '0,00';
    return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
