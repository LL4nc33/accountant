import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import { remult } from 'remult';
import { Invoice } from '../../../shared/entities/invoice';
import { Person } from '../../../shared/entities/person';
import { Company } from '../../../shared/entities/company';
import { Reminder } from '../../../shared/entities/reminder';
import { ModulesService } from '../../core/modules.service';
import { MPdfViewerComponent } from '../m-core/m-pdf-viewer.component';
import { MFormSectionComponent } from '../m-core/m-form-section.component';
import { MFormModalComponent } from '../m-core/m-form-modal.component';

@Component({
  selector: 'm-invoice-view',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, ClarityModule,
    MPdfViewerComponent, MFormSectionComponent, MFormModalComponent,
  ],
  templateUrl: './m-invoice-view.component.html',
  styleUrl: './m-invoice-view.component.scss',
})
export class MInvoiceViewComponent implements OnInit {
  @Input() id!: string;

  loading = true;
  entity?: Invoice | null;
  customerName = '';
  customerId = '';
  pdfUrl = '';

  // Modal-State
  showPaidModal = false;
  paidAtPicker: string = ''; // YYYY-MM-DD
  markingPaid = false;

  showFinalizeModal = false;
  finalizing = false;

  showStornoModal = false;
  stornoing = false;

  duplicating = false;
  archiving = false;

  reminders: Reminder[] = [];
  reminderCreating = false;

  constructor(
    public modules: ModulesService,
    private http: HttpClient,
    private router: Router,
    private toastr: ToastrService,
  ) {}

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    this.loading = true;
    this.entity = await remult.repo(Invoice).findFirst({ id: this.id });
    if (this.entity) {
      this.pdfUrl = `/api/invoice/pdf?id=${this.entity.id}`;
      this.customerId = this.entity.customerId;
      if (this.customerId) {
        const person = await remult.repo(Person).findFirst({ id: this.customerId });
        if (person) {
          this.customerName = `${person.firstname ?? ''} ${person.lastname ?? ''}`.trim() || '—';
        } else {
          const company = await remult.repo(Company).findFirst({ id: this.customerId });
          if (company) this.customerName = company.name || '—';
        }
      }
    }
    await this.loadReminders();
    this.loading = false;
  }

  async loadReminders() {
    if (!this.entity) return;
    this.reminders = await remult.repo(Reminder).find({
      where: { invoiceId: this.entity.id },
      orderBy: { reminderDate: 'asc' as any },
    });
  }

  get daysOverdue(): number {
    if (!this.entity?.finalized || this.entity?.paid || !this.entity?.invoiceDate) return 0;
    const due = new Date(this.entity.invoiceDate);
    due.setDate(due.getDate() + (this.entity.paymentTermsDays || 14));
    const diff = Date.now() - due.getTime();
    return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
  }

  get nextReminderStage(): 1 | 2 | 3 | null {
    const max = this.reminders.reduce((m, r) => Math.max(m, r.stage), 0);
    if (max >= 3) return null;
    return (max + 1) as 1 | 2 | 3;
  }

  stageLabel(s: 1 | 2 | 3): string {
    return s === 1 ? 'Erinnerung' : s === 2 ? 'Mahnung' : 'Letzte Mahnung';
  }

  async createReminder(stage: 1 | 2 | 3) {
    if (this.reminderCreating || !this.entity) return;
    this.reminderCreating = true;
    try {
      const res: any = await firstValueFrom(
        this.http.post('/api/reminder', { invoiceId: this.entity.id, stage }),
      );
      this.toastr.success(`Mahnung ${res.reminderNumber} angelegt`);
      await this.loadReminders();
    } catch (e: any) {
      this.toastr.error(e?.error?.error ?? e?.message ?? 'Fehler');
    } finally {
      this.reminderCreating = false;
    }
  }

  openReminderPdf(rid: string) {
    window.open(`/api/reminder/${rid}/pdf`, '_blank');
  }

  // ─── Bezahlt-markieren ──────────────────────────────
  openPaidModal() {
    const today = new Date();
    this.paidAtPicker = today.toISOString().substring(0, 10);
    this.showPaidModal = true;
  }

  async markPaid() {
    if (!this.entity) return;
    this.markingPaid = true;
    try {
      this.entity.paid = true;
      this.entity.paidAt = this.paidAtPicker ? new Date(this.paidAtPicker) : new Date();
      this.entity = await remult.repo(Invoice).save(this.entity);
      this.showPaidModal = false;
      this.toastr.success('Als bezahlt markiert');
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Markieren fehlgeschlagen');
    } finally {
      this.markingPaid = false;
    }
  }

  async markUnpaid() {
    if (!this.entity) return;
    try {
      this.entity.paid = false;
      this.entity.paidAt = null;
      this.entity = await remult.repo(Invoice).save(this.entity);
      this.toastr.success('Bezahlt-Status zurückgesetzt');
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Aktion fehlgeschlagen');
    }
  }

  // ─── Festschreiben ────────────────────────────────────
  openFinalizeModal() { this.showFinalizeModal = true; }
  async finalize() {
    if (!this.entity || this.entity.finalized) return;
    this.finalizing = true;
    try {
      this.entity.finalized = true;
      this.entity = await remult.repo(Invoice).save(this.entity);
      this.showFinalizeModal = false;
      this.toastr.success('Festgeschrieben');
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Festschreiben fehlgeschlagen');
    } finally {
      this.finalizing = false;
    }
  }

  // ─── Storno ────────────────────────────────────────
  openStornoModal() { this.showStornoModal = true; }
  async createStorno() {
    if (!this.entity) return;
    this.stornoing = true;
    try {
      const res: any = await firstValueFrom(
        this.http.post(`/api/invoice/${this.entity.id}/storno`, {}),
      );
      this.toastr.success(`Storno-Rechnung ${res.invoiceNumber} angelegt`);
      this.showStornoModal = false;
      this.router.navigate(['/m/invoice', res.id]);
    } catch (e: any) {
      this.toastr.error(e?.error?.error ?? e?.message ?? 'Storno fehlgeschlagen');
    } finally {
      this.stornoing = false;
    }
  }

  // ─── Duplicate ──────────────────────────────────────
  async duplicate() {
    if (!this.entity) return;
    this.duplicating = true;
    try {
      const res: any = await firstValueFrom(
        this.http.post(`/api/invoice/${this.entity.id}/duplicate`, {}),
      );
      this.toastr.success(`Kopie ${res.invoiceNumber} angelegt`);
      this.router.navigate(['/m/invoice', res.id]);
    } catch (e: any) {
      this.toastr.error(e?.error?.error ?? e?.message ?? 'Kopieren fehlgeschlagen');
    } finally {
      this.duplicating = false;
    }
  }

  // ─── Archivieren ──────────────────────────────────
  async toggleArchive() {
    if (!this.entity) return;
    this.archiving = true;
    try {
      this.entity.archived = !this.entity.archived;
      this.entity = await remult.repo(Invoice).save(this.entity);
      this.toastr.success(this.entity.archived ? 'Archiviert' : 'Reaktiviert');
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Aktion fehlgeschlagen');
    } finally {
      this.archiving = false;
    }
  }
}
