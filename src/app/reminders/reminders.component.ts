import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { firstValueFrom } from 'rxjs';
import { remult } from 'remult';
import { Person } from '../../shared/entities/person';
import { Company } from '../../shared/entities/company';
import { EmptyStateComponent } from '../core/empty-state/empty-state.component';

interface ReminderRow {
  id: string;
  reminderNumber: string;
  reminderDate: string;
  dueDate: string;
  stage: 1 | 2 | 3;
  totalDue: number;
  sent: boolean;
  sentAt: string | null;
  invoiceId: string;
  invoiceNumber: string | null;
  customerId: string | null;
  invoiceGross: number;
  invoiceDate: string | null;
  paid: boolean;
  daysOverdue: number;
}

@Component({
  selector: 'app-reminders',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule, RouterLink, EmptyStateComponent],
  templateUrl: './reminders.component.html',
  styleUrl: './reminders.component.scss',
})
export class RemindersComponent implements OnInit {
  rows: ReminderRow[] = [];
  customerNameById = new Map<string, string>();
  loading = true;
  filterStage: '' | '1' | '2' | '3' = '';
  filterSent: '' | 'sent' | 'open' = '';

  constructor(private http: HttpClient, private router: Router) {}

  async ngOnInit() {
    try {
      const res = await firstValueFrom(
        this.http.get<{ reminders: ReminderRow[] }>('/api/reminders/overview'),
      );
      this.rows = res.reminders;
      const ids = Array.from(new Set(this.rows.map((r) => r.customerId).filter(Boolean) as string[]));
      if (ids.length) {
        const [persons, companies] = await Promise.all([
          remult.repo(Person).find({ where: { id: { $in: ids } } }),
          remult.repo(Company).find({ where: { id: { $in: ids } } }),
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

  get filtered(): ReminderRow[] {
    return this.rows.filter((r) => {
      if (this.filterStage && r.stage !== Number(this.filterStage)) return false;
      if (this.filterSent === 'sent' && !r.sent) return false;
      if (this.filterSent === 'open' && r.sent) return false;
      return true;
    });
  }

  stageLabel(s: 1 | 2 | 3): string {
    return s === 1 ? 'Erinnerung' : s === 2 ? 'Mahnung' : 'Letzte Mahnung';
  }

  openInvoice(invoiceId: string) {
    this.router.navigate(['/om/invoice', invoiceId]);
  }
}
