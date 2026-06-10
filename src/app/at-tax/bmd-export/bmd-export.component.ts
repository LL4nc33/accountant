import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { CompanySettings } from '../../../shared/entities/company-settings';

type PeriodMode = 'month' | 'quarter' | 'year';

@Component({
  selector: 'app-bmd-export',
  imports: [CommonModule, FormsModule, ClarityModule],
  templateUrl: './bmd-export.component.html',
  styleUrl: './bmd-export.component.scss',
})
export class BmdExportComponent implements OnInit {
  mode: PeriodMode = 'quarter';
  year = new Date().getFullYear();
  month = new Date().getMonth() + 1;
  quarter = Math.floor(new Date().getMonth() / 3) + 1;

  settings: CompanySettings | null = null;
  loading = true;

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

  constructor(private toastr: ToastrService) {}

  async ngOnInit() {
    this.settings = (await remult.repo(CompanySettings).findFirst()) ?? null;
    this.loading = false;
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

  download() {
    window.location.href = `/api/bmd-export?period=${this.periodParam()}`;
    this.toastr.info(`BMD-Export ${this.periodLabel()} wird vorbereitet…`);
  }
}
