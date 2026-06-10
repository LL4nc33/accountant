import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { remult } from 'remult';
import { Invoice } from '../../../shared/entities/invoice';
import { Expense } from '../../../shared/entities/expense';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

@Component({
  selector: 'm-tax-export',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule, MFormSectionComponent],
  template: `
    <p class="m-muted-small">Ein-Klick-Export aller relevanten Daten als ZIP. Liefert Einnahmen-Ausgaben-Aufstellung + CSV-Listen.</p>

    <m-form-section title="Jahres-Paket">
      <label class="m-field">
        <span>Steuerjahr</span>
        <select [(ngModel)]="year" (ngModelChange)="refreshCounts()">
          <option *ngFor="let y of years" [ngValue]="y">{{ y }}</option>
        </select>
      </label>

      <div class="m-tax-counts">
        <div><strong>{{ invoiceCount }}</strong> Ausgangsrechnungen</div>
        <div><strong>{{ expenseCount }}</strong> Eingangsrechnungen</div>
      </div>

      <a class="m-pill m-pill-primary" [href]="downloadUrl" download>
        <cds-icon shape="download" size="16"></cds-icon>
        ZIP für {{ year }} herunterladen
      </a>
    </m-form-section>

    <m-form-section title="Was steckt drin?">
      <ul class="m-tax-files">
        <li><strong>uebersicht.txt</strong> — Einnahmen + Ausgaben + Saldo + KU-Schwellwert-Check</li>
        <li><strong>rechnungen.csv</strong> — Alle Ausgangsrechnungen des Jahres</li>
        <li><strong>ausgaben.csv</strong> — Alle Eingangsrechnungen / Belege des Jahres</li>
      </ul>
      <p class="m-muted-small">§132 BAO: 7 Jahre Aufbewahrungspflicht. Diese Aufstellung ist Vorbereitung — kein Ersatz für die Steuerberatung.</p>
    </m-form-section>
  `,
  styles: [`
    .m-muted-small { color: #666; font-size: 0.85rem; margin-bottom: 1rem; }
    .m-field { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 1rem;
      span { font-size: 0.85rem; font-weight: 600; }
      select { padding: 0.6rem 0.85rem; font-size: 1rem; border: 1px solid #DCDCDC; border-radius: 6px; min-height: 44px; }
    }
    .m-tax-counts { display: flex; gap: 1.5rem; margin: 1rem 0; font-size: 0.95rem;
      strong { font-size: 1.4rem; font-family: Georgia, serif; }
    }
    .m-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 1rem;
      background: white;
      border: 1px solid #DCDCDC;
      border-radius: 999px;
      font-size: 0.95rem;
      color: #1A1A1A;
      text-decoration: none;
      min-height: 48px;

      &.m-pill-primary {
        background: #1A1A1A;
        color: white;
        border-color: #1A1A1A;
      }
    }
    .m-tax-files {
      padding-left: 1.2rem;
      margin: 0 0 0.5rem;
      font-size: 0.95rem;
      li { margin-bottom: 0.4rem; }
    }
  `],
})
export class MTaxExportComponent implements OnInit {
  year = new Date().getFullYear();
  years: number[] = [];
  invoiceCount = 0;
  expenseCount = 0;

  async ngOnInit() {
    const now = new Date().getFullYear();
    this.years = Array.from({ length: 5 }, (_, i) => now - i);
    await this.refreshCounts();
  }

  async refreshCounts() {
    const [invs, exps] = await Promise.all([
      remult.repo(Invoice).find({}),
      remult.repo(Expense).find({}),
    ]);
    this.invoiceCount = invs.filter((i) => i.invoiceDate && new Date(i.invoiceDate).getFullYear() === this.year).length;
    this.expenseCount = exps.filter((e) => e.date && new Date(e.date).getFullYear() === this.year).length;
  }

  get downloadUrl(): string {
    return `/api/tax-export/${this.year}`;
  }
}
