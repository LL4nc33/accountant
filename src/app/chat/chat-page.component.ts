import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { MChatComponent } from '../m/m-chat/m-chat.component';

interface ConvSummary {
  id: string;
  title: string;
  turnCount: number;
  updatedAt: string;
}

/**
 * Desktop-Wrapper für die Chat-UI mit rechts-andockendem History-Panel.
 * Reused die Mobile-Component für die eigentliche Konversation, ergänzt um
 * Multi-Chat-Management (neue Chats anlegen, zwischen wechseln, archivieren).
 */
@Component({
  selector: 'app-chat-page',
  standalone: true,
  imports: [CommonModule, MChatComponent],
  template: `
    <div class="chat-page">
      <div class="chat-main">
        <m-chat #chat
          [conversationId]="activeId"
          (conversationChanged)="onConversationChanged($event)"
          (conversationReset)="onConversationReset()"></m-chat>
      </div>

      <aside class="chat-side">
        <button class="side-new" (click)="newChat()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          Neuer Chat
        </button>

        <div class="side-section-label" *ngIf="conversations.length">Verlauf</div>
        <p *ngIf="!conversations.length" class="side-empty">
          Noch keine Chats. Stell eine Frage oder klick „Neuer Chat".
        </p>
        <ul class="side-list">
          <li *ngFor="let c of conversations" [class.active]="c.id === activeId">
            <button class="side-item" (click)="switchTo(c.id)">
              <span class="side-title">{{ c.title || '(unbenannt)' }}</span>
              <span class="side-meta">{{ c.turnCount }} Nachrichten · {{ c.updatedAt | date:'dd.MM. HH:mm' }}</span>
            </button>
            <button class="side-archive" (click)="archive(c.id)" title="Archivieren" aria-label="Archivieren">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg>
            </button>
          </li>
        </ul>
      </aside>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .chat-page {
      display: grid;
      grid-template-columns: 1fr 260px;
      // Definite Viewport-Höhe (zuverlässiger als height:100% durch die
      // Clarity-Flex-Kette). Die .content-area-Regel (oidahub-theme) nimmt der
      // Seite Padding + Eigen-Scroll, damit hier kein dritter Scrollbalken bleibt.
      height: 100dvh;
    }
    @media (max-width: 920px) {
      .chat-page { grid-template-columns: 1fr; }
      .chat-side { display: none; }
    }

    // Chat-Spalte: füllt die Höhe; das innere .m-chat-msgs scrollt, der
    // Composer bleibt fix am unteren Rand.
    .chat-main {
      min-width: 0;
      height: 100%;
      overflow: hidden;
      padding: 0 2rem;
      --m-composer-bg: #ffffff;
    }
    .chat-main ::ng-deep m-chat { height: 100%; }
    .chat-main ::ng-deep .m-chat { max-width: 740px; }
    // Desktop: die interne Chat-Header-Leiste (Status + Neuer Chat) ist
    // redundant — das rechte Side-Panel besitzt „Neuer Chat" + Verlauf.
    .chat-main ::ng-deep .m-chat-header { display: none; }

    // Rechtes Side-Panel — wie der linke Nav-Rail, eigene Bordüre.
    .chat-side {
      border-left: 1px solid #E8E8E8;
      background: #FAFAFA;
      padding: 1rem 0.85rem;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      overflow-y: auto;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .side-new {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      background: white;
      border: 1px solid #DDD;
      color: #1A1A1A;
      font-size: 0.9rem;
      font-weight: 500;
      padding: 0.6rem 0.85rem;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      margin-bottom: 0.75rem;
      transition: background 0.15s, border-color 0.15s;
      svg { color: #555; }
      &:hover { background: #1A1A1A; border-color: #1A1A1A; color: #fff; svg { color: #fff; } }
    }
    .side-section-label {
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #999;
      padding: 0 0.4rem;
      margin-bottom: 0.35rem;
    }
    .side-empty {
      color: #999;
      font-size: 0.85rem;
      padding: 0.5rem 0.4rem;
      margin: 0;
      line-height: 1.5;
    }
    .side-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }
    .side-list li {
      display: flex;
      align-items: stretch;
      border-radius: 4px;
      transition: background 0.15s;
      .side-archive { opacity: 0; }
      &:hover {
        background: #F0F0F0;
        .side-archive { opacity: 1; }
      }
      &.active {
        background: #ECECEC;
        .side-title { color: #1A1A1A; font-weight: 600; }
      }
    }
    .side-item {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      background: transparent;
      border: none;
      text-align: left;
      padding: 0.5rem 0.55rem;
      cursor: pointer;
      font-family: inherit;
      min-width: 0;
      .side-title {
        font-size: 0.88rem;
        color: #333;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .side-meta { font-size: 0.7rem; color: #999; }
    }
    .side-archive {
      background: transparent;
      border: none;
      color: #AAA;
      cursor: pointer;
      padding: 0 0.6rem;
      display: flex;
      align-items: center;
      transition: opacity 0.15s, color 0.15s;
      &:hover { color: #555; }
    }
  `],
})
export class ChatPageComponent implements OnInit {
  @ViewChild('chat') chat?: MChatComponent;

  conversations: ConvSummary[] = [];
  activeId: string | null = null;

  constructor(private http: HttpClient) {}

  async ngOnInit() {
    await this.refresh();
  }

  async refresh() {
    try {
      const res = await firstValueFrom(
        this.http.get<{ conversations: ConvSummary[] }>('/api/llm/conversations'),
      );
      this.conversations = res.conversations ?? [];
      // Activate latest if no active yet
      if (!this.activeId && this.conversations.length) {
        this.activeId = this.conversations[0]!.id;
      }
    } catch {
      this.conversations = [];
    }
  }

  async newChat() {
    try {
      const res = await firstValueFrom(
        this.http.post<{ id: string; title: string }>('/api/llm/conversation', {}),
      );
      this.activeId = res.id;
      await this.refresh();
    } catch { /* ignore */ }
  }

  async switchTo(id: string) {
    if (id === this.activeId) return;
    this.activeId = id;
  }

  async archive(id: string) {
    if (!confirm('Diesen Chat archivieren?')) return;
    try {
      await firstValueFrom(
        this.http.delete(`/api/llm/conversation?id=${encodeURIComponent(id)}`),
      );
      if (id === this.activeId) this.activeId = null;
      await this.refresh();
    } catch { /* ignore */ }
  }

  onConversationChanged(info: { id: string; title: string }) {
    // Wird vom m-chat emittet wenn nach einer Nachricht der Server eine
    // conversationId zurückliefert (z.B. neue Conv automatisch angelegt).
    if (info?.id) {
      this.activeId = info.id;
      this.refresh();
    }
  }

  onConversationReset() {
    this.activeId = null;
    this.refresh();
  }
}
