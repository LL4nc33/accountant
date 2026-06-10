import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { Invoice } from '../../../shared/entities/invoice';
import { Expense } from '../../../shared/entities/expense';

@Component({
  selector: 'app-tax-export',
  imports: [CommonModule, FormsModule, ClarityModule],
  templateUrl: './tax-export.component.html',
  styleUrl: './tax-export.component.scss',
})
export class TaxExportComponent implements OnInit {
  selectedYear = new Date().getFullYear();
  availableYears: number[] = [];
  invoiceCount = 0;
  expenseCount = 0;
  loading = true;

  constructor(private toastr: ToastrService) {}

  async ngOnInit() {
    const [invoices, expenses] = await Promise.all([
      remult.repo(Invoice).find({ where: { archived: false } }),
      remult.repo(Expense).find({ where: { archived: false } }),
    ]);
    const years = new Set<number>([new Date().getFullYear()]);
    for (const i of invoices) years.add(new Date(i.invoiceDate).getFullYear());
    for (const e of expenses) years.add(new Date(e.date).getFullYear());
    this.availableYears = [...years].sort((a, b) => b - a);
    this.updateCounts(invoices, expenses);
    this.loading = false;
  }

  async refreshCounts() {
    const [invoices, expenses] = await Promise.all([
      remult.repo(Invoice).find({ where: { archived: false } }),
      remult.repo(Expense).find({ where: { archived: false } }),
    ]);
    this.updateCounts(invoices, expenses);
  }

  private updateCounts(invoices: Invoice[], expenses: Expense[]) {
    const start = new Date(this.selectedYear, 0, 1);
    const end = new Date(this.selectedYear + 1, 0, 1);
    this.invoiceCount = invoices.filter((i) => {
      const d = new Date(i.invoiceDate);
      return d >= start && d < end;
    }).length;
    this.expenseCount = expenses.filter((e) => {
      const d = new Date(e.date);
      return d >= start && d < end;
    }).length;
  }

  download() {
    // Browser triggert Download direkt — keine fetch+blob-Akrobatik nötig
    window.location.href = `/api/tax-export/${this.selectedYear}`;
    this.toastr.success(`Finanzamt-Paket ${this.selectedYear} wird vorbereitet…`);
  }
}
