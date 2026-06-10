import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { remult } from 'remult';
import { CompanySettings } from '../../../shared/entities/company-settings';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

type PeriodMode = 'month' | 'quarter' | 'year';

@Component({
  selector: 'm-bmd-export',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule, MFormSectionComponent],
  template: `
    <p class="m-muted-small">
      Steuerberater-Export — alle Buchungssätze als BMD/RZL-kompatible
      CSVs (Semikolon, deutsche Header, Komma-Dezimaltrenner).
    </p>

    <m-form-section title="Zeitraum">
      <div class="m-mode-toggle">
        <button [class.active]="mode === 'month'" (click)="mode = 'month'">Monat</button>
        <button [class.active]="mode === 'quarter'" (click)="mode = 'quarter'">Quartal</button>
        <button [class.active]="mode === 'year'" (click)="mode = 'year'">Jahr</button>
      </div>
      <label *ngIf="mode === 'month'" class="m-field">
        <span>Monat</span>
        <select [(ngModel)]="month">
          <option *ngFor="let m of months" [ngValue]="m.v">{{ m.l }}</option>
        </select>
      </label>
      <label *ngIf="mode === 'quarter'" class="m-field">
        <span>Quartal</span>
        <select [(ngModel)]="quarter">
          <option *ngFor="let q of quarters" [ngValue]="q">{{ q }}. Quartal</option>
        </select>
      </label>
      <label class="m-field">
        <span>Jahr</span>
        <select [(ngModel)]="year">
          <option *ngFor="let y of years" [ngValue]="y">{{ y }}</option>
        </select>
      </label>
    </m-form-section>

    <m-form-section title="Export">
      <a class="m-pill m-pill-primary" [href]="downloadUrl()" download>
        <cds-icon shape="download" size="16"></cds-icon>
        BMD-ZIP für {{ periodLabel() }} laden
      </a>
      <p class="m-muted-small" style="margin-top: 0.75rem;">
        Enthält umsaetze.csv, vorsteuer.csv, README.txt.
      </p>
    </m-form-section>

    <m-form-section title="Kontorahmen" *ngIf="settings">
      <p class="m-muted-small">Editierbar unter Einstellungen → Firma.</p>
      <table class="m-konten">
        <tbody>
          <tr><td>Forderungen</td><td class="konto">{{ settings.kontoForderungen }}</td></tr>
          <tr><td>Verbindlichkeiten</td><td class="konto">{{ settings.kontoVerbindlichkeiten }}</td></tr>
          <tr><td>Erlöse 20%</td><td class="konto">{{ settings.kontoErloese20 }}</td></tr>
          <tr><td>Erlöse 10%</td><td class="konto">{{ settings.kontoErloese10 }}</td></tr>
          <tr><td>Erlöse 13%</td><td class="konto">{{ settings.kontoErloese13 }}</td></tr>
          <tr><td>Erlöse 0%</td><td class="konto">{{ settings.kontoErloese0 }}</td></tr>
          <tr><td>Erlöse RC EU</td><td class="konto">{{ settings.kontoErloeseRC }}</td></tr>
          <tr><td>Erlöse Drittland</td><td class="konto">{{ settings.kontoErloeseDrittland }}</td></tr>
          <tr><td>USt 20%</td><td class="konto">{{ settings.kontoUst20 }}</td></tr>
          <tr><td>USt 10%</td><td class="konto">{{ settings.kontoUst10 }}</td></tr>
          <tr><td>USt 13%</td><td class="konto">{{ settings.kontoUst13 }}</td></tr>
          <tr><td>Vorsteuer</td><td class="konto">{{ settings.kontoVorsteuer }}</td></tr>
          <tr><td>Aufwand</td><td class="konto">{{ settings.kontoAufwand }}</td></tr>
        </tbody>
      </table>
    </m-form-section>
  `,
  styles: [`
    .m-muted-small { color: #666; font-size: 0.85rem; margin-bottom: 1rem; }
    .m-field { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 1rem;
      span { font-size: 0.85rem; font-weight: 600; }
      select { padding: 0.6rem 0.85rem; font-size: 1rem; border: 1px solid #DCDCDC; border-radius: 6px; min-height: 44px; }
    }
    .m-mode-toggle { display: flex; border: 1px solid #DCDCDC; border-radius: 6px; overflow: hidden; margin-bottom: 1rem;
      button { flex: 1; background: white; border: none; padding: 0.6rem 0.4rem; font-size: 0.92rem; cursor: pointer; color: #4a4a4a; min-height: 44px;
        &.active { background: #1A1A1A; color: white; }
      }
      button + button { border-left: 1px solid #DCDCDC; }
    }
    .m-pill { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1rem; background: white; border: 1px solid #DCDCDC; border-radius: 999px; font-size: 0.95rem; color: #1A1A1A; text-decoration: none; min-height: 48px;
      &.m-pill-primary { background: #1A1A1A; color: white; border-color: #1A1A1A; }
    }
    .m-konten { width: 100%; border-collapse: collapse; font-size: 0.9rem;
      td { padding: 4px 8px; border-bottom: 1px solid #eee; }
      td.konto { font-family: 'Source Code Pro', ui-monospace, monospace; font-weight: 600; color: #2f2f2f; text-align: right; width: 80px; }
    }
  `],
})
export class MBmdExportComponent implements OnInit {
  mode: PeriodMode = 'quarter';
  year = new Date().getFullYear();
  month = new Date().getMonth() + 1;
  quarter = Math.floor(new Date().getMonth() / 3) + 1;

  settings: CompanySettings | null = null;

  readonly months = [
    { v: 1, l: 'Jänner' }, { v: 2, l: 'Februar' }, { v: 3, l: 'März' },
    { v: 4, l: 'April' }, { v: 5, l: 'Mai' }, { v: 6, l: 'Juni' },
    { v: 7, l: 'Juli' }, { v: 8, l: 'August' }, { v: 9, l: 'September' },
    { v: 10, l: 'Oktober' }, { v: 11, l: 'November' }, { v: 12, l: 'Dezember' },
  ];
  readonly quarters = [1, 2, 3, 4];
  readonly years: number[] = (() => {
    const c = new Date().getFullYear();
    return [c, c - 1, c - 2, c - 3, c - 4];
  })();

  async ngOnInit() {
    this.settings = (await remult.repo(CompanySettings).findFirst()) ?? null;
  }

  periodParam(): string {
    if (this.mode === 'year') return String(this.year);
    if (this.mode === 'quarter') return `${this.year}-Q${this.quarter}`;
    return `${this.year}-${String(this.month).padStart(2, '0')}`;
  }

  periodLabel(): string {
    if (this.mode === 'year') return `Jahr ${this.year}`;
    if (this.mode === 'quarter') return `${this.quarter}. Quartal ${this.year}`;
    const m = this.months.find((x) => x.v === this.month);
    return `${m?.l ?? this.month} ${this.year}`;
  }

  downloadUrl(): string {
    return `/api/bmd-export?period=${this.periodParam()}`;
  }
}
