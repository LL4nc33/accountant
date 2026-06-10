import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

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
  selector: 'm-bank-abgleich',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule, MFormSectionComponent],
  template: `
    <p class="m-muted-small">
      CAMT.053 hochladen → accountant schlägt Matches gegen offene
      Rechnungen vor. Du bestätigst jede Zuordnung.
    </p>

    <m-form-section title="Import">
      <label class="m-upload">
        <input type="file" accept=".xml,.camt,application/xml,text/xml"
          (change)="onFile($event)" [disabled]="uploading" />
        <span>
          <cds-icon shape="upload-cloud" size="18"></cds-icon>
          {{ uploading ? 'Import läuft…' : 'CAMT.053-Datei wählen' }}
        </span>
      </label>
    </m-form-section>

    <div *ngIf="error" class="m-error">{{ error }}</div>

    <m-form-section [title]="unmatched.length + ' offene Buchungen'">
      <p *ngIf="!unmatched.length" class="m-muted-small">
        Keine offenen Buchungen — alles gematched oder ignoriert.
      </p>
      <div *ngFor="let tx of unmatched" class="m-tx-card">
        <div class="tx-row" (click)="toggle(tx)">
          <div class="tx-amount" [class.credit]="tx.direction === 'credit'">
            {{ tx.direction === 'credit' ? '+' : '−' }}{{ fmt(tx.amount) }} €
          </div>
          <div class="tx-meta">
            <div class="tx-line">{{ fmtDate(tx.bookingDate) }}</div>
            <div class="tx-cp">{{ tx.counterparty || '—' }}</div>
            <div class="tx-memo">{{ tx.memo || '' }}</div>
          </div>
          <div class="tx-cand-count">{{ tx.candidates.length }}</div>
        </div>

        <div class="tx-detail" *ngIf="expandedTxId === tx.id">
          <div *ngFor="let c of tx.candidates" class="cand-card">
            <div class="cand-head">
              <strong>{{ c.invoiceNumber }}</strong>
              <span class="score-pill" [ngClass]="scoreClass(c.score)">{{ c.score }}</span>
            </div>
            <div class="cand-meta">
              {{ c.customerName || '—' }} · {{ fmt(c.grossTotal) }} € · {{ fmtDate(c.invoiceDate) }}
            </div>
            <ul class="cand-reasons">
              <li *ngFor="let r of c.reasons">{{ r }}</li>
            </ul>
            <button class="m-pill m-pill-primary" (click)="confirmMatch(tx, c)">
              <cds-icon shape="check" size="14"></cds-icon> Bestätigen
            </button>
          </div>

          <div *ngIf="!tx.candidates.length" class="no-cand">
            Keine Match-Vorschläge.
          </div>

          <button class="m-pill" (click)="ignore(tx)">
            <cds-icon shape="eye-hide" size="14"></cds-icon> Ignorieren
          </button>
        </div>
      </div>
    </m-form-section>
  `,
  styles: [`
    .m-muted-small { color: #666; font-size: 0.85rem; margin-bottom: 1rem; }
    .m-error { padding: 0.75rem; background: #fbeaea; border-left: 3px solid #c92100; color: #8b0000; font-size: 0.9rem; margin: 1rem 0; }
    .m-upload { display: block; position: relative; border: 2px dashed #8aaad0; border-radius: 6px; padding: 0.85rem 1rem; background: #f4f8fd; color: #1c4d7c; cursor: pointer; min-height: 60px;
      input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
      span { display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.95rem; pointer-events: none; }
    }
    .m-tx-card { border: 1px solid #e0e0e0; border-radius: 4px; margin-bottom: 0.6rem; background: white; overflow: hidden;
      .tx-row { display: grid; grid-template-columns: auto 1fr auto; gap: 0.6rem; padding: 0.6rem; cursor: pointer; align-items: center;
        .tx-amount { font-family: Georgia, serif; font-weight: 600; font-size: 1.05rem; font-variant-numeric: tabular-nums; min-width: 80px;
          &.credit { color: #266100; }
        }
        .tx-meta {
          .tx-line { font-size: 0.85rem; font-weight: 500; }
          .tx-cp { font-size: 0.82rem; color: #4a4a4a; }
          .tx-memo { font-size: 0.78rem; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
        }
        .tx-cand-count { background: #e3edf9; color: #1c4d7c; border-radius: 999px; min-width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 600; }
      }
      .tx-detail { padding: 0.6rem; border-top: 1px solid #e0e0e0; background: #fafafa; }
    }
    .cand-card { padding: 0.6rem; border-radius: 4px; background: white; margin-bottom: 0.5rem; border: 1px solid #e0e0e0;
      .cand-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem; }
      .cand-meta { font-size: 0.82rem; color: #4a4a4a; margin-bottom: 0.3rem; }
      .cand-reasons { font-size: 0.78rem; color: #666; padding-left: 1.1rem; margin: 0.3rem 0; }
    }
    .score-pill { padding: 1px 8px; border-radius: 999px; font-size: 0.78rem; font-weight: 600; background: #e0e0e0; color: #4a4a4a;
      &.high { background: #dff4d5; color: #266100; }
      &.mid { background: #fdf6e3; color: #7d5100; }
    }
    .m-pill { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.9rem; background: white; border: 1px solid #DCDCDC; border-radius: 999px; font-size: 0.88rem; color: #1A1A1A; cursor: pointer; min-height: 40px;
      &.m-pill-primary { background: #1A1A1A; color: white; border-color: #1A1A1A; }
    }
    .no-cand { padding: 0.5rem; color: #7d5100; background: #fdf6e3; border-left: 3px solid #b97500; font-size: 0.85rem; margin-bottom: 0.5rem; }
  `],
})
export class MBankAbgleichComponent implements OnInit {
  unmatched: UnmatchedTx[] = [];
  expandedTxId: string | null = null;
  uploading = false;
  error = '';

  constructor(private toastr: ToastrService) {}

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.error = '';
    try {
      const resp = await fetch('/api/bank/unmatched', { credentials: 'include' });
      if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`);
      const j = await resp.json();
      this.unmatched = j.transactions ?? [];
    } catch (e: any) {
      this.error = e?.message || 'Konnte Liste nicht laden';
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
      this.toastr.success(`${j.imported} neu, ${j.duplicates} Dubletten`);
      input.value = '';
      await this.load();
    } catch (e: any) {
      this.toastr.error(e?.message || 'Import fehlgeschlagen');
    } finally {
      this.uploading = false;
    }
  }

  async confirmMatch(tx: UnmatchedTx, cand: MatchCandidate) {
    if (!confirm(`Rechnung ${cand.invoiceNumber} verknüpfen?`)) return;
    try {
      const resp = await fetch(
        `/api/bank/${encodeURIComponent(tx.id)}/assign/${encodeURIComponent(cand.invoiceId)}`,
        { method: 'POST', credentials: 'include' },
      );
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || `HTTP ${resp.status}`);
      this.toastr.success(`Rechnung ${cand.invoiceNumber} bezahlt`);
      await this.load();
    } catch (e: any) {
      this.toastr.error(e?.message || 'Verknüpfung fehlgeschlagen');
    }
  }

  async ignore(tx: UnmatchedTx) {
    if (!confirm('Buchung ignorieren?')) return;
    try {
      const resp = await fetch(`/api/bank/${encodeURIComponent(tx.id)}/ignore`, {
        method: 'POST',
        credentials: 'include',
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || `HTTP ${resp.status}`);
      this.toastr.info('Ignoriert');
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
    return '';
  }
}
