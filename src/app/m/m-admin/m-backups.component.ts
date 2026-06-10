import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

interface SnapshotDto {
  name: string;
  size: number;
  mtime: string;
  age: 'daily' | 'weekly' | 'monthly' | 'old';
}

interface ListResponse {
  backupDir: string;
  retention: { daily: number; weekly: number; monthly: number };
  count: number;
  totalSize: number;
  snapshots: SnapshotDto[];
}

@Component({
  selector: 'm-backups',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule, MFormSectionComponent],
  template: `
    <p class="m-muted-small">
      SQLite-Snapshots — alle 24 h automatisch, Retention 7T / 4W / 12M.
    </p>

    <div *ngIf="error" class="m-error">{{ error }}</div>

    <m-form-section title="Übersicht" *ngIf="data">
      <div class="m-stat-row">
        <div><span>Snapshots</span><strong>{{ data.count }}</strong></div>
        <div><span>Gesamt</span><strong>{{ fmtSize(data.totalSize) }}</strong></div>
      </div>
      <p class="m-muted-small" style="margin-top: 0.5rem;">
        Retention: {{ data.retention.daily }}T / {{ data.retention.weekly }}W /
        {{ data.retention.monthly }}M
      </p>
      <button class="m-pill m-pill-primary" (click)="triggerNow()" [disabled]="busy">
        <cds-icon shape="backup" size="16"></cds-icon>
        {{ busy ? 'Snapshot läuft…' : 'Jetzt sichern' }}
      </button>
    </m-form-section>

    <m-form-section title="Snapshots" *ngIf="data && data.snapshots.length">
      <div *ngFor="let s of data.snapshots" class="m-snap-card">
        <div class="snap-head">
          <div class="snap-name">{{ s.name }}</div>
          <span class="age-pill" [ngClass]="'age-' + s.age">{{ ageLabel(s.age) }}</span>
        </div>
        <div class="snap-meta">
          <span>{{ fmtDate(s.mtime) }}</span>
          <span>{{ fmtSize(s.size) }}</span>
        </div>
        <div class="snap-actions">
          <a class="m-pill" [href]="'/api/backup/download/' + s.name" download>
            <cds-icon shape="download" size="14"></cds-icon> Download
          </a>
          <button class="m-pill m-pill-danger" (click)="remove(s.name)">
            <cds-icon shape="trash" size="14"></cds-icon> Löschen
          </button>
        </div>
      </div>
    </m-form-section>

    <p class="m-muted-small" *ngIf="data && !data.snapshots.length">
      Noch keine Snapshots. Erster Lauf ca. 30 s nach Server-Start.
    </p>
  `,
  styles: [`
    .m-muted-small { color: #666; font-size: 0.85rem; margin-bottom: 1rem; }
    .m-error { padding: 0.75rem; background: #fbeaea; border-left: 3px solid #c92100; color: #8b0000; font-size: 0.9rem; margin: 1rem 0; }
    .m-stat-row { display: flex; gap: 1rem; font-size: 0.9rem;
      > div { flex: 1; display: flex; flex-direction: column; gap: 0.2rem; }
      span { color: #666; }
      strong { font-size: 1.2rem; font-family: Georgia, serif; }
    }
    .m-pill { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.85rem; background: white; border: 1px solid #DCDCDC; border-radius: 999px; font-size: 0.88rem; color: #1A1A1A; text-decoration: none; min-height: 40px;
      &.m-pill-primary { background: #1A1A1A; color: white; border-color: #1A1A1A; }
      &.m-pill-danger { color: #8b0000; border-color: #d9b9b9; }
    }
    .m-snap-card { padding: 0.6rem 0; border-bottom: 1px solid #eee;
      .snap-head { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
      .snap-name { font-family: 'Source Code Pro', ui-monospace, monospace; font-size: 0.82rem; word-break: break-all; }
      .snap-meta { display: flex; justify-content: space-between; color: #666; font-size: 0.82rem; margin-top: 0.2rem; }
      .snap-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
    }
    .age-pill { display: inline-block; padding: 1px 6px; border-radius: 999px; font-size: 0.72rem; font-weight: 600; background: #e0e0e0; color: #1a1a1a; white-space: nowrap;
      &.age-daily { background: #dff4d5; color: #266100; }
      &.age-weekly { background: #e3edf9; color: #1c4d7c; }
      &.age-monthly { background: #fdf6e3; color: #7d5100; }
    }
  `],
})
export class MBackupsComponent implements OnInit {
  data: ListResponse | null = null;
  busy = false;
  error = '';

  constructor(private toastr: ToastrService) {}

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.error = '';
    try {
      const resp = await fetch('/api/backup/list', { credentials: 'include' });
      if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`);
      this.data = (await resp.json()) as ListResponse;
    } catch (e: any) {
      this.error = e?.message || 'Liste konnte nicht geladen werden';
    }
  }

  async triggerNow() {
    if (this.busy) return;
    this.busy = true;
    try {
      const resp = await fetch('/api/backup/now', { method: 'POST', credentials: 'include' });
      if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`);
      this.toastr.success('Snapshot erstellt');
      await this.load();
    } catch (e: any) {
      this.toastr.error(e?.message || 'Snapshot fehlgeschlagen');
    } finally {
      this.busy = false;
    }
  }

  async remove(name: string) {
    if (!confirm(`Snapshot „${name}" wirklich löschen?`)) return;
    try {
      const resp = await fetch(`/api/backup/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`);
      this.toastr.success('Snapshot gelöscht');
      await this.load();
    } catch (e: any) {
      this.toastr.error(e?.message || 'Löschen fehlgeschlagen');
    }
  }

  fmtSize(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  fmtDate(iso: string): string {
    return new Date(iso).toLocaleString('de-AT');
  }

  ageLabel(age: SnapshotDto['age']): string {
    if (age === 'daily') return 'täglich';
    if (age === 'weekly') return 'wöchentlich';
    if (age === 'monthly') return 'monatlich';
    return 'alt';
  }
}
