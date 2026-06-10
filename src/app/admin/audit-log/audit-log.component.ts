import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule, ClrDatagridModule } from '@clr/angular';
import { remult } from 'remult';
import { AuditLog, auditOperations } from '../../../shared/entities/audit-log';

@Component({
  selector: 'app-audit-log',
  imports: [CommonModule, FormsModule, ClarityModule, ClrDatagridModule],
  templateUrl: './audit-log.component.html',
  styleUrl: './audit-log.component.scss',
})
export class AuditLogComponent implements OnInit {
  rows: AuditLog[] = [];
  loading = true;
  filterEntity = '';
  filterOperation = '';
  operations = auditOperations;

  async ngOnInit() {
    try {
      this.rows = await remult.repo(AuditLog).find({
        orderBy: { timestamp: 'desc' },
        limit: 500,
      });
    } finally {
      this.loading = false;
    }
  }

  parseDiff(diffJson: string): string {
    try {
      const obj = JSON.parse(diffJson);
      return Object.entries(obj)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join(' · ');
    } catch {
      return diffJson;
    }
  }

  get filtered(): AuditLog[] {
    return this.rows.filter((r) => {
      if (this.filterEntity && r.entityType !== this.filterEntity) return false;
      if (this.filterOperation && r.operation !== this.filterOperation) return false;
      return true;
    });
  }

  get entityTypes(): string[] {
    return [...new Set(this.rows.map((r) => r.entityType))].sort();
  }

  opLabel(op: string): string {
    return {
      create: 'Angelegt',
      update: 'Geändert',
      delete: 'Gelöscht',
      finalize: 'Festgeschrieben',
      paid: 'Bezahlt',
    }[op] ?? op;
  }
}
