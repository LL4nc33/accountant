import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { Expense, expenseCategories, expensePaymentStatuses } from '../../../shared/entities/expense';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

@Component({
  selector: 'm-expense-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule, MFormSectionComponent],
  templateUrl: './m-expense-edit.component.html',
  styleUrl: './m-expense-edit.component.scss',
})
export class MExpenseEditComponent implements OnInit {
  @Input() id!: string;

  loading = true;
  saving = false;
  entity!: Expense;
  isNew = false;

  categories = expenseCategories;
  paymentStatuses = expensePaymentStatuses;

  // Internes: für den date-input brauchen wir YYYY-MM-DD-String
  dateStr = '';
  paidAtStr = '';

  constructor(private router: Router, private toastr: ToastrService) {}

  async ngOnInit() {
    if (this.id === 'new') {
      this.isNew = true;
      this.entity = remult.repo(Expense).create();
      const today = new Date();
      this.entity.date = today;
      this.dateStr = today.toISOString().substring(0, 10);
    } else {
      const found = await remult.repo(Expense).findFirst({ id: this.id });
      if (found) {
        this.entity = found;
        if (this.entity.date) this.dateStr = new Date(this.entity.date).toISOString().substring(0, 10);
        if (this.entity.paidAt) this.paidAtStr = new Date(this.entity.paidAt).toISOString().substring(0, 10);
      } else {
        this.toastr.error('Ausgabe nicht gefunden');
        this.router.navigate(['/m/expenses']);
        return;
      }
    }
    this.loading = false;
  }

  recalcGross() {
    const net = Number(this.entity.netTotal) || 0;
    const vat = Number(this.entity.vatRate) || 0;
    this.entity.grossTotal = Math.round(net * (1 + vat / 100) * 100) / 100;
  }

  recalcNet() {
    const gross = Number(this.entity.grossTotal) || 0;
    const vat = Number(this.entity.vatRate) || 0;
    this.entity.netTotal = Math.round((gross / (1 + vat / 100)) * 100) / 100;
  }

  async save() {
    this.saving = true;
    try {
      if (this.dateStr) this.entity.date = new Date(this.dateStr);
      if (this.entity.paymentStatus === 'bezahlt' && this.paidAtStr) {
        this.entity.paidAt = new Date(this.paidAtStr);
      }
      this.entity = await remult.repo(Expense).save(this.entity);
      this.toastr.success(this.isNew ? 'Ausgabe angelegt' : 'Ausgabe gespeichert');
      this.router.navigate(['/m/expenses']);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }

  cancel() {
    this.router.navigate(['/m/expenses']);
  }
}
