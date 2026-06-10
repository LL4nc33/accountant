import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { Offer, OfferStatus } from '../../../shared/entities/offer';
import { Person } from '../../../shared/entities/person';
import { Company } from '../../../shared/entities/company';

@Component({
  selector: 'app-offers',
  imports: [CommonModule, FormsModule, ClarityModule, RouterLink],
  templateUrl: './offers.component.html',
  styleUrl: './offers.component.scss',
})
export class OffersComponent implements OnInit {
  repo = remult.repo(Offer);
  offers: Offer[] = [];
  customerNameById = new Map<string, string>();
  loading = true;
  filterStatus: '' | OfferStatus = '';
  showArchived = false;

  constructor(private router: Router, private toastr: ToastrService) {}

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading = true;
    try {
      this.offers = await this.repo.find({ orderBy: { offerDate: 'desc' as any } });
      const ids = Array.from(new Set(this.offers.map((o) => o.customerId).filter(Boolean)));
      if (ids.length) {
        const [persons, companies] = await Promise.all([
          remult.repo(Person).find({ where: { id: ids } }),
          remult.repo(Company).find({ where: { id: ids } }),
        ]);
        const m = new Map<string, string>();
        for (const p of persons) m.set(p.id, p.displayName);
        for (const c of companies) m.set(c.id, c.displayName);
        this.customerNameById = m;
      }
    } finally {
      this.loading = false;
    }
  }

  get filteredOffers(): Offer[] {
    return this.offers.filter((o) => {
      if (!this.showArchived && o.archived) return false;
      if (this.filterStatus && o.status !== this.filterStatus) return false;
      return true;
    });
  }

  customerName(o: Offer): string {
    return this.customerNameById.get(o.customerId) ?? '—';
  }

  kindShort(kind: string | undefined): string {
    switch (kind) {
      case 'order_confirmation': return 'AB';
      case 'delivery_note':      return 'LS';
      default:                   return 'Angebot';
    }
  }

  statusLabel(s: OfferStatus): string {
    switch (s) {
      case 'draft': return 'Entwurf';
      case 'sent': return 'Versendet';
      case 'won': return 'Angenommen';
      case 'lost': return 'Abgelehnt';
      case 'expired': return 'Abgelaufen';
    }
  }

  statusClass(s: OfferStatus): string {
    return `status-${s}`;
  }

  openPdf(o: Offer) {
    window.open(`/api/offer/pdf?id=${o.id}`, '_blank');
  }

  async convert(o: Offer) {
    if (o.status === 'won' && o.convertedInvoiceId) {
      this.router.navigate(['/om/invoice', o.convertedInvoiceId]);
      return;
    }
    if (!confirm(
      `Angebot „${o.offerNumber}" jetzt in eine Rechnung umwandeln?\n\n` +
      `Status wird auf „angenommen" gesetzt, Items werden 1:1 in die neue Rechnung kopiert.`
    )) return;
    try {
      const resp = await fetch(`/api/offer/${o.id}/convert`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || `HTTP ${resp.status}`);
      this.toastr.success(`Rechnung ${j.invoiceNumber} aus Angebot erzeugt`);
      this.router.navigate(['/om/invoice', j.invoiceId]);
    } catch (e: any) {
      this.toastr.error(e?.message || 'Konvertierung fehlgeschlagen');
    }
  }

  async setStatus(o: Offer, status: 'sent' | 'lost' | 'expired') {
    try {
      const resp = await fetch(`/api/offer/${o.id}/status`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!resp.ok) {
        const j = await resp.json();
        throw new Error(j.error || `HTTP ${resp.status}`);
      }
      this.toastr.success(`Status: ${this.statusLabel(status)}`);
      await this.load();
    } catch (e: any) {
      this.toastr.error(e?.message || 'Status-Update fehlgeschlagen');
    }
  }

  fmt(n: number): string {
    return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  fmtDate(d: Date | null | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-AT');
  }
}
