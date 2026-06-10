import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';

interface MatchCandidate {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  grossTotal: number;
  score: number;
  reasons: string[];
}

interface UnmatchedTx {
  id: string;
  txId: string;
  bookingDate: string;
  amount: number;
  currency: string;
  direction: 'credit' | 'debit';
  counterparty: string;
  counterpartyIban: string;
  memo: string;
  candidates: MatchCandidate[];
}

@Component({
  selector: 'app-bank-abgleich',
  imports: [CommonModule, FormsModule, ClarityModule, RouterLink],
  templateUrl: './bank-abgleich.component.html',
  styleUrl: './bank-abgleich.component.scss',
})
export class BankAbgleichComponent implements OnInit {
  unmatched: UnmatchedTx[] = [];
  loading = false;
  uploading = false;
  error = '';
  expandedTxId: string | null = null;

  constructor(private toastr: ToastrService) {}

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading = true;
    this.error = '';
    try {
      const resp = await fetch('/api/bank/unmatched', { credentials: 'include' });
      if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`);
      const j = await resp.json();
      this.unmatched = j.transactions ?? [];
    } catch (e: any) {
      this.error = e?.message || 'Konnte Liste nicht laden';
    } finally {
      this.loading = false;
    }
  }

  async onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploading = true;
    try {
      const text = await file.text();
      const resp = await fetch('/api/bank/import-camt', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/xml' },
        body: text,
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || `HTTP ${resp.status}`);
      this.toastr.success(`${j.imported} neue Buchungen importiert (${j.duplicates} Dubletten übersprungen)`);
      input.value = '';
      await this.load();
    } catch (e: any) {
      this.toastr.error(e?.message || 'Import fehlgeschlagen');
    } finally {
      this.uploading = false;
    }
  }

  async confirmMatch(tx: UnmatchedTx, cand: MatchCandidate) {
    if (!confirm(
      `Rechnung „${cand.invoiceNumber}" (${this.fmt(cand.grossTotal)} €) ` +
      `mit Bank-Buchung am ${this.fmtDate(tx.bookingDate)} verknüpfen?\n\n` +
      `Die Rechnung wird als bezahlt markiert.`
    )) return;
    try {
      const resp = await fetch(
        `/api/bank/${encodeURIComponent(tx.id)}/assign/${encodeURIComponent(cand.invoiceId)}`,
        { method: 'POST', credentials: 'include' },
      );
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || `HTTP ${resp.status}`);
      this.toastr.success(`Rechnung ${cand.invoiceNumber} ist bezahlt`);
      await this.load();
    } catch (e: any) {
      this.toastr.error(e?.message || 'Verknüpfung fehlgeschlagen');
    }
  }

  async ignore(tx: UnmatchedTx) {
    if (!confirm(`Buchung „${tx.memo || tx.counterparty}" ignorieren?`)) return;
    try {
      const resp = await fetch(`/api/bank/${encodeURIComponent(tx.id)}/ignore`, {
        method: 'POST',
        credentials: 'include',
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || `HTTP ${resp.status}`);
      this.toastr.info('Buchung ignoriert');
      await this.load();
    } catch (e: any) {
      this.toastr.error(e?.message || 'Aktion fehlgeschlagen');
    }
  }

  toggle(tx: UnmatchedTx) {
    this.expandedTxId = this.expandedTxId === tx.id ? null : tx.id;
  }

  fmt(n: number): string {
    return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  fmtDate(iso: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('de-AT');
  }

  scoreClass(score: number): string {
    if (score >= 70) return 'high';
    if (score >= 50) return 'mid';
    return 'low';
  }

  scoreLabel(score: number): string {
    if (score >= 70) return 'sehr wahrscheinlich';
    if (score >= 50) return 'wahrscheinlich';
    return 'möglich';
  }
}
