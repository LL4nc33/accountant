import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import {
  Expense,
  expenseCategories,
  expensePaymentStatuses,
} from '../../../shared/entities/expense';
import { PaperlessPickerComponent } from '../../core/paperless-picker/paperless-picker.component';

@Component({
  selector: 'app-expense-edit',
  imports: [CommonModule, FormsModule, ClarityModule, RouterLink, PaperlessPickerComponent],
  templateUrl: './expense-edit.component.html',
  styleUrl: './expense-edit.component.scss',
})
export class ExpenseEditComponent implements OnInit {
  categories = expenseCategories;
  statuses = expensePaymentStatuses;
  repo = remult.repo(Expense);
  entity?: Expense;
  saving = false;
  isNew = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private toastr: ToastrService,
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') ?? 'new';
    if (id === 'new') {
      this.entity = this.repo.create();
      this.isNew = true;
    } else {
      const found = await this.repo.findFirst({ id });
      if (!found) {
        this.toastr.error('Ausgabe nicht gefunden');
        this.router.navigate(['/expenses']);
        return;
      }
      this.entity = found;
    }
  }

  // ── Beleg-OCR ─────────────────────────────────────────────────────
  ocrBusy = false;
  ocrError = '';

  async onOcrFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.entity) return;
    this.ocrBusy = true;
    this.ocrError = '';
    try {
      const buf = await file.arrayBuffer();
      const resp = await fetch('/api/llm/vision-ocr', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': file.type || 'image/jpeg' },
        body: buf,
      });
      const json = await resp.json();
      if (!resp.ok) {
        this.ocrError = json?.error ?? `HTTP ${resp.status}`;
        this.toastr.error(this.ocrError);
        return;
      }
      const p = json.proposal ?? {};
      let filled = 0;
      if (p.vendor && !this.entity.vendor) { this.entity.vendor = p.vendor; filled++; }
      if (p.reference && !this.entity.reference) { this.entity.reference = p.reference; filled++; }
      if (p.description && !this.entity.description) { this.entity.description = p.description; filled++; }
      if (p.category && (this.categories as readonly string[]).includes(p.category)) {
        this.entity.category = p.category as any;
        filled++;
      }
      if (p.date) {
        try { this.entity.date = new Date(p.date); filled++; } catch { /* ignore bad date */ }
      }
      if (typeof p.vatRate === 'number') { this.entity.vatRate = p.vatRate; filled++; }
      if (typeof p.netTotal === 'number') { this.entity.netTotal = p.netTotal; filled++; }
      if (typeof p.grossTotal === 'number') {
        this.entity.grossTotal = p.grossTotal;
        filled++;
      } else if (typeof p.netTotal === 'number' && typeof p.vatRate === 'number') {
        this.recalcGross();
      }
      this.toastr.success(`${filled} Felder aus Beleg übernommen. Bitte prüfen.`);
    } catch (e: any) {
      this.ocrError = e?.message ?? 'OCR fehlgeschlagen';
      this.toastr.error(this.ocrError);
    } finally {
      this.ocrBusy = false;
      input.value = '';
    }
  }

  /** Berechnet brutto aus netto + USt-Satz. Wird bei netTotal/vatRate-Änderungen aufgerufen. */
  recalcGross() {
    if (!this.entity) return;
    this.entity.grossTotal = +(this.entity.netTotal * (1 + this.entity.vatRate / 100)).toFixed(2);
  }

  /** Umgekehrt: aus brutto die netto-Komponente herleiten. */
  recalcNet() {
    if (!this.entity) return;
    this.entity.netTotal = +(this.entity.grossTotal / (1 + this.entity.vatRate / 100)).toFixed(2);
  }

  async save() {
    if (!this.entity) return;
    if (!this.entity.vendor) { this.toastr.error('Bitte Lieferant angeben'); return; }
    this.saving = true;
    try {
      this.entity = await this.repo.save(this.entity);
      this.toastr.success('Ausgabe gespeichert');
      this.router.navigate(['/expenses']);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }

  async toggleArchive() {
    if (!this.entity?.id || this.isNew) return;
    this.entity.archived = !this.entity.archived;
    this.entity = await this.repo.save(this.entity);
    this.toastr.success(this.entity.archived ? 'Ausgabe archiviert' : 'Ausgabe reaktiviert');
    this.router.navigate(['/expenses']);
  }

  async hardDelete() {
    if (!this.entity?.id || this.isNew) return;
    if (!confirm('Endgültig löschen? Bei §132 BAO Pflichtbelegen kann das Konsequenzen haben — empfohlen wird Archivieren.')) return;
    try {
      await this.repo.delete(this.entity.id);
      this.router.navigate(['/expenses']);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Löschen fehlgeschlagen — eventuell muss erst archiviert werden.');
    }
  }
}
