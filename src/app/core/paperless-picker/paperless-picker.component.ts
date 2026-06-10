import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';

interface PaperlessHit {
  id: number;
  title: string;
  created: string;
}

/**
 * Such-Picker für Paperless-ngx-Dokumente. Aufruf:
 * 1. Klick auf Toggle-Button → öffnet inline Suchfeld
 * 2. User tippt Query → Live-Suche via /api/paperless/search
 * 3. Klick auf Treffer → emit `documentSelected(id)` + Button schließt
 *
 * Zeigt aktuell verknüpftes Dokument an (per `currentDocId`). Klick auf
 * „Beleg ansehen" öffnet das Original im Paperless-Web-UI in neuem Tab.
 */
@Component({
  selector: 'app-paperless-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule],
  template: `
    <div class="pp" *ngIf="status.configured">
      <div *ngIf="currentDocId" class="pp-current">
        <span class="pp-link">Beleg #{{ currentDocId }} verknüpft</span>
        <a *ngIf="status.url" [href]="status.url + '/documents/' + currentDocId + '/'"
          target="_blank" class="btn btn-sm btn-link">
          <cds-icon shape="link"></cds-icon> Beleg ansehen
        </a>
        <button type="button" class="btn btn-sm btn-link" (click)="clear()">
          <cds-icon shape="times"></cds-icon> Verknüpfung lösen
        </button>
      </div>
      <div *ngIf="!currentDocId" class="pp-empty">
        <span class="muted">Kein Beleg verknüpft.</span>
        <button type="button" class="btn btn-sm" (click)="toggleSearch()">
          <cds-icon shape="search"></cds-icon>
          {{ showSearch ? 'Abbrechen' : 'Aus Paperless suchen' }}
        </button>
      </div>

      <div *ngIf="showSearch" class="pp-search">
        <input type="text" [(ngModel)]="query" (ngModelChange)="onQuery($event)"
          placeholder="Such-Begriff (Lieferant, Belegnummer, …)" autofocus />
        <p *ngIf="searching" class="muted">Suche läuft…</p>
        <p *ngIf="!searching && query.length >= 2 && !hits.length" class="muted">
          Nichts gefunden.
        </p>
        <ul *ngIf="hits.length" class="pp-results">
          <li *ngFor="let h of hits" (click)="pick(h)">
            <div class="pp-hit-title">{{ h.title }}</div>
            <div class="pp-hit-meta muted">#{{ h.id }} · {{ h.created | date:'dd.MM.yyyy' }}</div>
          </li>
        </ul>
      </div>
    </div>
    <div *ngIf="!status.configured && !statusLoading" class="muted pp-not-config">
      Paperless-ngx nicht konfiguriert. Setup unter
      <a routerLink="/settings/company">Firmen-Einstellungen</a>.
    </div>
  `,
  styles: [`
    .pp { font-family: system-ui, sans-serif; }
    .muted { color: #888; font-size: 0.85rem; }
    .pp-current { display: flex; gap: 0.6rem; align-items: center; padding: 0.4rem 0.6rem; background: #f4f8fd; border-left: 3px solid #1c4d7c; border-radius: 3px;
      .pp-link { font-weight: 600; color: #1c4d7c; }
    }
    .pp-empty { display: flex; gap: 0.6rem; align-items: center; }
    .pp-search { margin-top: 0.5rem; padding: 0.5rem; background: #fafafa; border-radius: 3px;
      input { width: 100%; padding: 5px 8px; border: 1px solid #ccc; border-radius: 3px; font-size: 0.92rem; }
    }
    .pp-results { list-style: none; padding: 0; margin: 0.5rem 0 0; max-height: 240px; overflow-y: auto;
      li { padding: 6px 8px; border-bottom: 1px solid #eee; cursor: pointer;
        &:hover { background: #e8f0fa; }
        .pp-hit-title { font-size: 0.92rem; font-weight: 500; }
        .pp-hit-meta { font-size: 0.78rem; margin-top: 2px; }
      }
    }
    .pp-not-config { padding: 0.4rem 0.6rem; background: #fafafa; border-left: 3px solid #ccc; border-radius: 3px; font-size: 0.85rem;
      a { color: #1c4d7c; }
    }
  `],
})
export class PaperlessPickerComponent implements OnInit {
  @Input() currentDocId: string = '';
  @Output() currentDocIdChange = new EventEmitter<string>();

  status: { configured: boolean; connected?: boolean; url?: string; documentCount?: number } = {
    configured: false,
  };
  statusLoading = true;

  showSearch = false;
  query = '';
  hits: PaperlessHit[] = [];
  searching = false;
  private debounceTimer: any = null;

  async ngOnInit() {
    try {
      const resp = await fetch('/api/paperless/status', { credentials: 'include' });
      if (resp.ok) this.status = await resp.json();
    } catch {
      // ignore
    } finally {
      this.statusLoading = false;
    }
  }

  toggleSearch() {
    this.showSearch = !this.showSearch;
    if (!this.showSearch) {
      this.query = '';
      this.hits = [];
    }
  }

  onQuery(q: string) {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (q.trim().length < 2) {
      this.hits = [];
      return;
    }
    this.debounceTimer = setTimeout(() => this.runSearch(q.trim()), 250);
  }

  async runSearch(q: string) {
    this.searching = true;
    try {
      const resp = await fetch(`/api/paperless/search?q=${encodeURIComponent(q)}`, {
        credentials: 'include',
      });
      if (!resp.ok) {
        this.hits = [];
        return;
      }
      const data = await resp.json();
      this.hits = data?.results ?? [];
    } catch {
      this.hits = [];
    } finally {
      this.searching = false;
    }
  }

  pick(hit: PaperlessHit) {
    this.currentDocId = String(hit.id);
    this.currentDocIdChange.emit(this.currentDocId);
    this.showSearch = false;
    this.query = '';
    this.hits = [];
  }

  clear() {
    this.currentDocId = '';
    this.currentDocIdChange.emit('');
  }
}
