import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { remult } from 'remult';
import { AuditLog, auditOperations } from '../../../shared/entities/audit-log';

@Component({
  selector: 'm-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <p class="m-muted-small">Append-only Änderungs-Protokoll. §131 BAO / §146 AO / GeBüV Art. 958f.</p>
    <div class="m-list-toolbar">
      <div class="m-pills">
        <select [(ngModel)]="filterEntity" class="m-pill-select">
          <option value="">— alle Entities —</option>
          <option *ngFor="let e of entityTypes" [value]="e">{{ e }}</option>
        </select>
        <select [(ngModel)]="filterOperation" class="m-pill-select">
          <option value="">— alle Operationen —</option>
          <option *ngFor="let op of operations" [value]="op">{{ opLabel(op) }}</option>
        </select>
      </div>
    </div>

    <p *ngIf="loading" class="m-muted">Lädt …</p>
    <p *ngIf="!loading && filtered.length === 0" class="m-muted">Keine Einträge.</p>

    <div *ngFor="let r of filtered.slice(0, 100)" class="m-audit-row">
      <div class="m-audit-row-head">
        <span class="m-audit-time">{{ r.timestamp | date:'dd.MM. HH:mm' }}</span>
        <span class="m-badge" [class.m-badge-success]="r.operation === 'create'"
                                  [class.m-badge-warning]="r.operation === 'delete' || r.operation === 'finalize'"
                                  [class.m-badge-info]="r.operation === 'paid'">{{ opLabel(r.operation) }}</span>
        <span class="m-audit-entity">{{ r.entityType }}</span>
      </div>
      <div class="m-audit-row-meta">
        <span>{{ r.userName }}</span>
      </div>
      <div class="m-audit-diff" *ngIf="r.diff">{{ parseDiff(r.diff) }}</div>
    </div>
    <p *ngIf="filtered.length > 100" class="m-muted-small">… und {{ filtered.length - 100 }} weitere ausgeblendet.</p>
  `,
  styles: [`
    .m-list-toolbar { margin-bottom: 1rem; }
    .m-pills { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .m-pill-select {
      padding: 0.4rem 0.8rem;
      background: white;
      border: 1px solid #DCDCDC;
      border-radius: 999px;
      font-size: 0.85rem;
      font-family: inherit;
      min-height: 36px;
      flex: 1;
    }
    .m-audit-row {
      padding: 0.7rem 0;
      border-bottom: 1px solid #E8E8E8;
    }
    .m-audit-row-head {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin-bottom: 0.2rem;
    }
    .m-audit-time { font-family: 'SF Mono', Menlo, monospace; font-size: 0.78rem; color: #666; }
    .m-audit-entity { color: #1A1A1A; font-weight: 500; }
    .m-audit-row-meta { font-size: 0.85rem; color: #888; }
    .m-audit-diff { font-size: 0.78rem; color: #666; font-family: 'SF Mono', Menlo, monospace; margin-top: 0.3rem; word-break: break-word; }
    .m-muted, .m-muted-small { color: #888; }
    .m-muted { text-align: center; padding: 2rem 1rem; }
    .m-muted-small { font-size: 0.85rem; margin-bottom: 0.75rem; }
  `],
})
export class MAuditLogComponent implements OnInit {
  loading = true;
  rows: AuditLog[] = [];
  filterEntity = '';
  filterOperation = '';
  operations = auditOperations;

  async ngOnInit() {
    this.rows = await remult.repo(AuditLog).find({ orderBy: { timestamp: 'desc' }, limit: 500 });
    this.loading = false;
  }

  parseDiff(diffJson: string): string {
    try {
      const obj = JSON.parse(diffJson);
      return Object.entries(obj).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' · ');
    } catch { return diffJson; }
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
}
