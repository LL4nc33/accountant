import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  ClarityModule,
  ClrCheckboxModule,
  ClrComboboxModule,
  ClrFormsModule,
  ClrModalModule,
  ClrTabsModule,
} from '@clr/angular';
import { TranslateModule } from '@ngx-translate/core';
import { remult } from 'remult';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import { Invoice } from '../../../shared/entities/invoice';
import { CompanySettings } from '../../../shared/entities/company-settings';
import { Person } from '../../../shared/entities/person';
import { Company } from '../../../shared/entities/company';
import { featureFlags } from '../../feature-flags';
import { PdfViewerModule } from 'ng2-pdf-viewer';
import { Reminder } from '../../../shared/entities/reminder';
import { ModulesService } from '../../core/modules.service';

@Component({
  selector: 'app-invoice-view',
  imports: [
    CommonModule,
    FormsModule,
    ClrFormsModule,
    ClarityModule,
    ClrCheckboxModule,
    ClrComboboxModule,
    RouterLink,
    ClrTabsModule,
    ClrModalModule,
    TranslateModule, // Add TranslateModule to imports
    PdfViewerModule,
  ],
  templateUrl: './invoice-view.component.html',
  styleUrl: './invoice-view.component.scss',
})
export class InvoiceViewComponent {
  showConfirmDeleteModal = false;
  showConfirmFinalizeModal = false;
  showMailModal = false;
  finalizing = false;
  smtpConfigured = false;
  mailTo = '';
  mailSubject = '';
  mailBody = '';
  sending = false;
  featureFlags = featureFlags;

  @Input() id!: string;
  repo = remult.repo(Invoice);
  entity?: Invoice | null;

  reminders: Reminder[] = [];
  reminderCreating = false;

  customerName = '';
  customerLink: string | null = null;

  constructor(
    public modules: ModulesService,
    private router: Router,
    private http: HttpClient,
    private toastr: ToastrService,
  ) {}

  async ngOnInit() {
    this.entity = await this.repo.findId(this.id);
    const settings = await remult.repo(CompanySettings).findFirst();
    this.smtpConfigured = !!(settings?.smtpHost && settings?.smtpFromAddress);
    await this.loadCustomer();
    await this.loadReminders();
  }

  private async loadCustomer() {
    if (!this.entity?.customerId) return;
    const person = await remult.repo(Person).findFirst({ id: this.entity.customerId });
    if (person) {
      this.customerName = person.displayName?.trim() || '(unbenannte Person)';
      this.customerLink = `/crm/person/${person.id}`;
      return;
    }
    const company = await remult.repo(Company).findFirst({ id: this.entity.customerId });
    if (company) {
      this.customerName = company.name || '(unbenannte Firma)';
      this.customerLink = `/crm/company/${company.id}`;
    }
  }

  async loadReminders() {
    this.reminders = await remult.repo(Reminder).find({
      where: { invoiceId: this.id },
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
      this.toastr.success(`Mahnung ${res.reminderNumber} angelegt (Entwurf)`);
      await this.loadReminders();
    } catch (e: any) {
      this.toastr.error(e?.error?.error ?? e?.message ?? 'Mahnung konnte nicht angelegt werden');
    } finally {
      this.reminderCreating = false;
    }
  }

  openReminderPdf(rid: string) {
    window.open(`/api/reminder/${rid}/pdf`, '_blank');
  }

  async openMailModal() {
    if (!this.entity) return;
    // Recipient-Default: Customer-E-Mail wenn vorhanden
    const person = await remult.repo(Person).findFirst({ id: this.entity.customerId });
    const company = !person ? await remult.repo(Company).findFirst({ id: this.entity.customerId }) : null;
    const customer = person ?? company;
    this.mailTo = customer?.email ?? '';
    this.mailSubject = '';
    this.mailBody = '';
    this.showMailModal = true;
  }

  async sendMail() {
    if (!this.entity || !this.mailTo) return;
    this.sending = true;
    try {
      const res: any = await firstValueFrom(
        this.http.post(`/api/invoice/${this.entity.id}/send-mail`, {
          to: this.mailTo,
          subject: this.mailSubject || undefined,
          body: this.mailBody || undefined,
        }),
      );
      this.toastr.success(res?.message ?? 'E-Mail versendet');
      this.showMailModal = false;
    } catch (e: any) {
      this.toastr.error(e?.error?.error ?? e?.message ?? 'Versand fehlgeschlagen');
    } finally {
      this.sending = false;
    }
  }

  confirmDelete() {
    this.showConfirmDeleteModal = true;
  }

  async delete() {
    this.showConfirmDeleteModal = false;
    await this.repo.delete(this.id);
    this.router.navigate(['/om/invoice']);
  }

  confirmFinalize() {
    this.showConfirmFinalizeModal = true;
  }

  async finalize() {
    if (!this.entity || this.entity.finalized) return;
    this.finalizing = true;
    try {
      this.entity.finalized = true;
      this.entity = await this.repo.save(this.entity);
      this.showConfirmFinalizeModal = false;
    } finally {
      this.finalizing = false;
    }
  }

  async toggleArchive() {
    if (!this.entity) return;
    this.entity.archived = !this.entity.archived;
    this.entity = await this.repo.save(this.entity);
  }

  showConfirmStornoModal = false;
  stornoing = false;
  duplicating = false;

  confirmStorno() { this.showConfirmStornoModal = true; }

  async duplicate() {
    if (!this.entity) return;
    this.duplicating = true;
    try {
      const res: any = await firstValueFrom(
        this.http.post(`/api/invoice/${this.entity.id}/duplicate`, {}),
      );
      this.toastr.success(`Kopie ${res.invoiceNumber} angelegt`);
      this.router.navigate(['/om/invoice', res.id, 'edit']);
    } catch (e: any) {
      this.toastr.error(e?.error?.error ?? e?.message ?? 'Kopieren fehlgeschlagen');
    } finally {
      this.duplicating = false;
    }
  }

  showPaidModal = false;
  markingPaid = false;
  paidAtPicker: Date | string | null = null;

  openPaidModal() {
    this.paidAtPicker = new Date();
    this.showPaidModal = true;
  }

  async markPaid() {
    if (!this.entity) return;
    this.markingPaid = true;
    try {
      this.entity.paid = true;
      this.entity.paidAt = this.paidAtPicker ? new Date(this.paidAtPicker) : new Date();
      this.entity = await this.repo.save(this.entity);
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
      this.entity = await this.repo.save(this.entity);
      this.toastr.success('Bezahlt-Status zurückgesetzt');
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Aktion fehlgeschlagen');
    }
  }

  async createStorno() {
    if (!this.entity) return;
    this.stornoing = true;
    try {
      const res: any = await firstValueFrom(
        this.http.post(`/api/invoice/${this.entity.id}/storno`, {}),
      );
      this.toastr.success(`Storno-Rechnung ${res.invoiceNumber} angelegt`);
      this.showConfirmStornoModal = false;
      this.router.navigate(['/om/invoice', res.id, 'edit']);
    } catch (e: any) {
      this.toastr.error(e?.error?.error ?? e?.message ?? 'Storno fehlgeschlagen');
    } finally {
      this.stornoing = false;
    }
  }
}
