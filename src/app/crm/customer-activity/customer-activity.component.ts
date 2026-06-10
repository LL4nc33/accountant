import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { remult } from 'remult';
import { Invoice } from '../../../shared/entities/invoice';
import { InvoiceItem } from '../../../shared/entities/invoice-item';
import { Project } from '../../../shared/entities/project';
import { TimeEntry } from '../../../shared/entities/time-entry';
import { Product } from '../../../shared/entities/product';
import { CustomerNote, customerNoteKinds, CustomerNoteKind } from '../../../shared/entities/customer-note';
import { ModulesService } from '../../core/modules.service';

interface InvoiceRow {
  id: string;
  number: string;
  date: Date | null;
  gross: number;
  finalized: boolean;
  paid: boolean;
  isStorno: boolean;
}

interface ProjectRow {
  id: string;
  name: string;
  status: string;
  openHours: number;
}

interface ProductRow {
  name: string;
  count: number;
  totalQty: number;
  lastDate: Date | null;
}

@Component({
  selector: 'app-customer-activity',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ClarityModule],
  templateUrl: './customer-activity.component.html',
  styleUrl: './customer-activity.component.scss',
})
export class CustomerActivityComponent implements OnChanges {
  @Input({ required: true }) customerId!: string;

  loading = true;
  invoices: InvoiceRow[] = [];
  projects: ProjectRow[] = [];
  products: ProductRow[] = [];

  /** Customer Lifetime Value — kumuliertes Brutto aller festgeschriebenen
   * Nicht-Storno-Rechnungen. Mit `paidGross` als Sub-Aggregat zeigen wir
   * zusätzlich was davon schon bezahlt ist (vs. außenständig). */
  totalGross = 0;
  paidGross = 0;
  openGross = 0;
  invoiceCount = 0;

  // ── Activity-Timeline ─────────────────────────────────────────────
  notes: CustomerNote[] = [];
  readonly noteKinds = customerNoteKinds;
  noteKindLabels: Record<CustomerNoteKind, string> = {
    note: 'Notiz',
    call: 'Telefonat',
    meeting: 'Termin',
    email: 'E-Mail',
    visit: 'Vor-Ort',
  };
  noteKindIcons: Record<CustomerNoteKind, string> = {
    note: 'note',
    call: 'phone-handset',
    meeting: 'calendar',
    email: 'envelope',
    visit: 'map',
  };
  draftNote = this.emptyDraftNote();
  savingNote = false;

  private emptyDraftNote() {
    return {
      kind: 'note' as CustomerNoteKind,
      title: '',
      body: '',
      occurredAt: this.todayIso(),
    };
  }

  private todayIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  noteKindLabel(k: CustomerNoteKind): string {
    return this.noteKindLabels[k] ?? k;
  }

  noteKindIcon(k: CustomerNoteKind): string {
    return this.noteKindIcons[k] ?? 'note';
  }

  async addNote() {
    if (!this.draftNote.title.trim() || this.savingNote) return;
    this.savingNote = true;
    try {
      const n = remult.repo(CustomerNote).create();
      n.customerId = this.customerId;
      n.kind = this.draftNote.kind;
      n.title = this.draftNote.title.trim();
      n.body = this.draftNote.body.trim();
      n.occurredAt = new Date(this.draftNote.occurredAt);
      const saved = await remult.repo(CustomerNote).save(n);
      this.notes = [saved, ...this.notes];
      this.draftNote = this.emptyDraftNote();
    } finally {
      this.savingNote = false;
    }
  }

  async deleteNote(note: CustomerNote) {
    if (!confirm(`Eintrag „${note.title}" löschen?`)) return;
    try {
      await remult.repo(CustomerNote).delete(note);
      this.notes = this.notes.filter((n) => n.id !== note.id);
    } catch (e: any) {
      alert('Löschen fehlgeschlagen: ' + (e?.message ?? 'unbekannt'));
    }
  }

  constructor(public modules: ModulesService) {}

  async ngOnChanges() {
    if (!this.customerId) return;
    this.loading = true;
    try {
      const [invs, projs, notes] = await Promise.all([
        remult.repo(Invoice).find({
          where: { customerId: this.customerId },
          orderBy: { invoiceDate: 'desc' },
        }),
        this.modules.isEnabled('projects')
          ? remult.repo(Project).find({ where: { customerId: this.customerId } })
          : Promise.resolve([] as Project[]),
        remult.repo(CustomerNote).find({
          where: { customerId: this.customerId, archived: false },
          orderBy: { occurredAt: 'desc' as any },
        }),
      ]);
      this.notes = notes;

      this.invoices = invs.map((inv) => ({
        id: inv.id,
        number: inv.invoiceNumber || '—',
        date: inv.invoiceDate ? new Date(inv.invoiceDate) : null,
        gross: inv.grossTotal ?? 0,
        finalized: inv.finalized,
        paid: inv.paid,
        isStorno: !!inv.correctsInvoiceId,
      }));

      // CLV: nur festgeschriebene + nicht-Storno zählen für realistisches LTV.
      // Storno-Rechnungen reduzieren über negative Beträge automatisch via paid-Flow.
      let total = 0, paid = 0, count = 0;
      for (const row of this.invoices) {
        if (!row.finalized || row.isStorno) continue;
        total += row.gross;
        if (row.paid) paid += row.gross;
        count++;
      }
      this.totalGross = total;
      this.paidGross = paid;
      this.openGross = total - paid;
      this.invoiceCount = count;

      // Projects + offene Stunden je Projekt
      const projectIds = projs.map((p) => p.id);
      const timeEntries = projectIds.length
        ? await remult.repo(TimeEntry).find({ where: { projectId: { $in: projectIds } } })
        : [];
      const openHoursByProject = new Map<string, number>();
      for (const t of timeEntries) {
        if (t.billedInvoiceItemId) continue;
        openHoursByProject.set(t.projectId, (openHoursByProject.get(t.projectId) ?? 0) + (t.hours ?? 0));
      }
      this.projects = projs.map((p) => ({
        id: p.id,
        name: p.name || '—',
        status: p.status,
        openHours: openHoursByProject.get(p.id) ?? 0,
      }));

      // Produkt-Historie aus Invoice-Items
      if (invs.length) {
        const invoiceIds = invs.map((i) => i.id);
        const items = await remult.repo(InvoiceItem).find({ where: { invoiceId: { $in: invoiceIds } } });
        const productIds = Array.from(new Set(items.map((i) => i.productId).filter(Boolean) as string[]));
        const productMap = new Map<string, Product>();
        if (productIds.length) {
          const prods = await remult.repo(Product).find({ where: { id: { $in: productIds } } });
          for (const p of prods) productMap.set(p.id, p);
        }
        const invoiceDateById = new Map<string, Date | null>();
        for (const inv of invs) invoiceDateById.set(inv.id, inv.invoiceDate ? new Date(inv.invoiceDate) : null);

        const agg = new Map<string, ProductRow>();
        for (const item of items) {
          if (!item.productId) continue;
          const prod = productMap.get(item.productId);
          const name = prod?.name || item.name || '—';
          const date = invoiceDateById.get(item.invoiceId) ?? null;
          const existing = agg.get(item.productId) ?? { name, count: 0, totalQty: 0, lastDate: null };
          existing.count += 1;
          existing.totalQty += item.quantity ?? 0;
          if (date && (!existing.lastDate || date > existing.lastDate)) existing.lastDate = date;
          agg.set(item.productId, existing);
        }
        this.products = Array.from(agg.values()).sort((a, b) => {
          const ta = a.lastDate?.getTime() ?? 0;
          const tb = b.lastDate?.getTime() ?? 0;
          return tb - ta;
        });
      } else {
        this.products = [];
      }
    } finally {
      this.loading = false;
    }
  }
}
