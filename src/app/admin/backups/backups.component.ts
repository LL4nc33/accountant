import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';

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
  selector: 'app-backups',
  imports: [CommonModule, FormsModule, ClarityModule],
  templateUrl: './backups.component.html',
  styleUrl: './backups.component.scss',
})
export class BackupsComponent implements OnInit {
  data: ListResponse | null = null;
  loading = false;
  busy = false;
  error = '';

  constructor(private toastr: ToastrService) {}

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading = true;
    this.error = '';
    try {
      const resp = await fetch('/api/backup/list', { credentials: 'include' });
      if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`);
      this.data = (await resp.json()) as ListResponse;
    } catch (e: any) {
      this.error = e?.message || 'Liste konnte nicht geladen werden';
      this.data = null;
    } finally {
      this.loading = false;
    }
  }

  async triggerNow() {
    if (this.busy) return;
    this.busy = true;
    try {
      const resp = await fetch('/api/backup/now', {
        method: 'POST',
        credentials: 'include',
      });
      if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`);
      const json = await resp.json();
      this.toastr.success(`Snapshot erstellt: ${json.snapshot?.name}`);
      await this.load();
    } catch (e: any) {
      this.toastr.error(e?.message || 'Snapshot fehlgeschlagen');
    } finally {
      this.busy = false;
    }
  }

  download(name: string) {
    window.location.href = `/api/backup/download/${encodeURIComponent(name)}`;
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

  ageClass(age: SnapshotDto['age']): string {
    return `age-${age}`;
  }
}
