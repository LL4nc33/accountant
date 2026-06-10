import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { AgentMemory } from '../../shared/entities/agent-memory';

/**
 * Memory-UI: zeigt, was sich die beiden Agenten gemerkt haben.
 * Transparenz — der User sieht alle Fakten und kann sie löschen.
 * Getrennt nach Agent (Buchhalter / Support).
 */
@Component({
  selector: 'app-agent-memory',
  standalone: true,
  imports: [CommonModule, ClarityModule],
  template: `
    <main class="mem">
      <div class="page-head">
        <div class="page-head-text">
          <h1>Agent-Gedächtnis</h1>
          <p>
            Was sich deine KI-Agenten dauerhaft gemerkt haben. Sie schreiben das selbst —
            proaktiv oder wenn du „merk dir …" sagst. Du behältst die Kontrolle: hier siehst
            und löschst du jeden Eintrag.
          </p>
        </div>
      </div>

      <p *ngIf="loading" class="muted">Lädt…</p>

      <ng-container *ngIf="!loading">
        <section class="mem-group" *ngFor="let g of groups">
          <div class="mem-group-head">
            <h2>{{ g.label }}</h2>
            <span class="mem-count">{{ g.items.length }}</span>
          </div>
          <p *ngIf="!g.items.length" class="muted small">Noch nichts gemerkt.</p>
          <ul class="mem-list" *ngIf="g.items.length">
            <li *ngFor="let m of g.items">
              <span class="mem-cat">{{ m.category }}</span>
              <span class="mem-content">{{ m.content }}</span>
              <span class="mem-date">{{ m.createdAt | date:'dd.MM.yyyy' }}</span>
              <button class="mem-del" (click)="remove(m)" title="Vergessen" aria-label="Vergessen">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>
              </button>
            </li>
          </ul>
        </section>
      </ng-container>
    </main>
  `,
  styles: [`
    .mem { max-width: 820px; }
    .mem-group { margin-bottom: 1.75rem; }
    .mem-group-head {
      display: flex; align-items: center; gap: 0.6rem;
      border-bottom: 1px solid #E8E8E8; padding-bottom: 0.4rem; margin-bottom: 0.75rem;
      h2 { font-size: 1rem; font-weight: 600; margin: 0; }
    }
    .mem-count {
      font-size: 0.75rem; font-weight: 600; color: #666;
      background: #F0F0F0; border-radius: 999px; padding: 0.1rem 0.55rem;
    }
    .mem-list { list-style: none; padding: 0; margin: 0; }
    .mem-list li {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 0.55rem 0.25rem; border-bottom: 1px solid #F3F3F3;
    }
    .mem-cat {
      flex-shrink: 0; font-size: 0.72rem; font-weight: 600;
      color: #4a4a4a; background: #F5F5F5; border-radius: 4px;
      padding: 0.15rem 0.5rem; min-width: 78px; text-align: center;
    }
    .mem-content { flex: 1; font-size: 0.92rem; color: #1A1A1A; }
    .mem-date { flex-shrink: 0; font-size: 0.78rem; color: #999; font-variant-numeric: tabular-nums; }
    .mem-del {
      flex-shrink: 0; background: transparent; border: none; color: #BBB;
      cursor: pointer; padding: 0.3rem; border-radius: 4px; display: flex;
      &:hover { color: #c92100; background: #FBEAEA; }
    }
    .muted { color: #888; }
    .small { font-size: 0.85rem; }
  `],
})
export class AgentMemoryComponent implements OnInit {
  repo = remult.repo(AgentMemory);
  loading = true;
  groups: { scope: string; label: string; items: AgentMemory[] }[] = [
    { scope: 'accountant', label: 'Buchhalter', items: [] },
    { scope: 'support', label: 'Support', items: [] },
  ];

  constructor(private toastr: ToastrService) {}

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading = true;
    const all = await this.repo.find({ where: { archived: false }, orderBy: { createdAt: 'desc' } });
    for (const g of this.groups) g.items = all.filter((m) => m.agentScope === g.scope);
    this.loading = false;
  }

  async remove(m: AgentMemory) {
    try {
      await this.repo.delete(m);
      for (const g of this.groups) g.items = g.items.filter((x) => x.id !== m.id);
      this.toastr.success('Vergessen');
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Löschen fehlgeschlagen');
    }
  }
}
