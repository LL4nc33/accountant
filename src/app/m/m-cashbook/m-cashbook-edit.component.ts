import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { CashbookEntry, cashbookCategories } from '../../../shared/entities/cashbook-entry';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

@Component({
  selector: 'm-cashbook-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MFormSectionComponent],
  template: `
    <p *ngIf="loading" class="m-muted">Lädt…</p>

    <form *ngIf="!loading && entry" class="m-form" (ngSubmit)="save()">
      <m-form-section title="Buchung">
        <label class="m-field">
          <span>Datum</span>
          <input type="date" name="entryDate" [(ngModel)]="entry.entryDate" />
        </label>
        <label class="m-field">
          <span>Beleg-Nr.</span>
          <input type="text" name="documentNumber" [(ngModel)]="entry.documentNumber" />
        </label>
        <label class="m-field">
          <span>Beschreibung</span>
          <input type="text" name="description" [(ngModel)]="entry.description" required />
        </label>
        <label class="m-field">
          <span>Kategorie</span>
          <select name="category" [(ngModel)]="entry.category">
            <option *ngFor="let c of categories" [value]="c">{{ c }}</option>
          </select>
        </label>
        <label class="m-field">
          <span>Betrag (EUR) — positiv=Einnahme, negativ=Ausgabe</span>
          <input type="number" step="0.01" name="amount" [(ngModel)]="entry.amount" inputmode="decimal" />
        </label>
        <label class="m-field">
          <span>USt-Satz (%)</span>
          <input type="number" step="0.1" name="vatRate" [(ngModel)]="entry.vatRate" inputmode="decimal" />
        </label>
        <div class="m-split" *ngIf="entry.vatRate > 0">
          Netto: {{ fmt(entry.amountNet) }} € · USt {{ entry.vatRate }}%: {{ fmt(entry.vatAmount) }} €
        </div>
      </m-form-section>

      <m-form-section title="Verknüpfungen (optional)">
        <label class="m-field">
          <span>Rechnung-ID</span>
          <input type="text" name="linkedInvoiceId" [(ngModel)]="entry.linkedInvoiceId" />
        </label>
        <label class="m-field">
          <span>Expense-ID</span>
          <input type="text" name="linkedExpenseId" [(ngModel)]="entry.linkedExpenseId" />
        </label>
        <label class="m-field">
          <span>Bemerkungen</span>
          <textarea name="notes" [(ngModel)]="entry.notes" rows="2"></textarea>
        </label>
      </m-form-section>

      <div class="m-form-actions">
        <button type="submit" class="m-pill m-pill-primary" [disabled]="saving">{{ saving ? 'Speichert…' : 'Speichern' }}</button>
        <button type="button" class="m-pill" (click)="toggleArchive()" *ngIf="!isNew">{{ entry.archived ? 'Reaktivieren' : 'Archivieren' }}</button>
        <a routerLink="/m/cashbook" class="m-pill">Abbrechen</a>
      </div>
    </form>
  `,
  styles: [`
    .m-split { font-size: 0.85rem; padding: 0.5rem; background: #fafafa; border-left: 3px solid #318700; margin: 0.4rem 0; }
    .m-muted { color: #888; text-align: center; padding: 2rem 1rem; }
  `],
  styleUrls: ['../m-expenses/m-expense-edit.component.scss'],
})
export class MCashbookEditComponent implements OnInit {
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
      if (!found) { this.router.navigate(['/m/cashbook']); return; }
      this.entry = found;
    }
    this.loading = false;
  }

  async save() {
    if (!this.entry) return;
    this.saving = true;
    try {
      this.entry = await remult.repo(CashbookEntry).save(this.entry);
      this.toastr.success('Gespeichert');
      this.router.navigate(['/m/cashbook']);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Fehler');
    } finally { this.saving = false; }
  }

  async toggleArchive() {
    if (!this.entry) return;
    this.entry.archived = !this.entry.archived;
    await this.save();
  }

  fmt(n: number | undefined): string {
    if (n === undefined || n === null) return '0,00';
    return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
