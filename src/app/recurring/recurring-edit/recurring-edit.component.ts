import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { RecurringInvoice, recurringIntervals } from '../../../shared/entities/recurring-invoice';
import { Invoice } from '../../../shared/entities/invoice';

interface InvoiceOption { id: string; label: string; }

@Component({
  selector: 'app-recurring-edit',
  imports: [CommonModule, FormsModule, ClarityModule, RouterLink],
  templateUrl: './recurring-edit.component.html',
  styleUrl: './recurring-edit.component.scss',
})
export class RecurringEditComponent implements OnInit {
  intervals = recurringIntervals;
  repo = remult.repo(RecurringInvoice);
  entity?: RecurringInvoice;
  templates: InvoiceOption[] = [];
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
        this.toastr.error('Eintrag nicht gefunden');
        this.router.navigate(['/recurring']);
        return;
      }
      this.entity = found;
    }
    const invoices = await remult.repo(Invoice).find({
      where: { archived: false },
      orderBy: { invoiceDate: 'desc' },
      limit: 100,
    });
    this.templates = invoices.map((inv) => ({
      id: inv.id,
      label: `${inv.invoiceNumber} — ${inv.subject} (${new Date(inv.invoiceDate).toLocaleDateString('de-AT')})`,
    }));
  }

  async save() {
    if (!this.entity) return;
    if (!this.entity.title) { this.toastr.error('Bitte Bezeichnung eingeben'); return; }
    if (!this.entity.templateInvoiceId) { this.toastr.error('Bitte Vorlage-Rechnung wählen'); return; }
    this.saving = true;
    try {
      await this.repo.save(this.entity);
      this.toastr.success('Gespeichert');
      this.router.navigate(['/recurring']);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }

  async deleteEntry() {
    if (!this.entity?.id || this.isNew) return;
    if (!confirm('Wirklich löschen? Bereits erzeugte Rechnungen bleiben unverändert.')) return;
    await this.repo.delete(this.entity.id);
    this.router.navigate(['/recurring']);
  }
}
