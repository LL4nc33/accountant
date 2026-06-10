import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ClarityModule, ClrDatagridModule } from '@clr/angular';
import { remult } from 'remult';
import { RecurringInvoice } from '../../shared/entities/recurring-invoice';
import { EmptyStateComponent } from '../core/empty-state/empty-state.component';

@Component({
  selector: 'app-recurring',
  imports: [CommonModule, FormsModule, ClarityModule, ClrDatagridModule, RouterLink, EmptyStateComponent],
  templateUrl: './recurring.component.html',
  styleUrl: './recurring.component.scss',
})
export class RecurringComponent implements OnInit {
  rows: RecurringInvoice[] = [];
  loading = true;

  async ngOnInit() {
    this.rows = await remult.repo(RecurringInvoice).find({ orderBy: { nextRunDate: 'asc' } });
    this.loading = false;
  }
}
