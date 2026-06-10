import { CommonModule } from '@angular/common';
import { Component, HostListener, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, NavigationEnd } from '@angular/router';
import { firstValueFrom, filter } from 'rxjs';
import { MChatComponent } from '../../m/m-chat/m-chat.component';

interface ConvSummary {
  id: string;
  title: string;
  turnCount: number;
  updatedAt: string;
}

/**
 * Globales Floating-Chat-Widget (Facebook-/Intercom-Style).
 * Ein FAB unten rechts öffnet ein schwebendes Chat-Panel, das m-chat
 * wiederverwendet. Liegt als Overlay über jeder Seite — der User kann
 * weiter navigieren (auch via navigate_to des Support-Agenten), während
 * der Chat offen bleibt. Kein Wechsel zum /chat-Tab nötig.
 *
 * Eingehängt im Desktop-Shell (navigation.component). Auf Mobile/Login
 * wird die Komponente nicht gerendert.
 */
@Component({
  selector: 'app-chat-widget',
  standalone: true,
  imports: [CommonModule, MChatComponent],
  template: `
   <ng-container *ngIf="!onChatRoute">
    <!-- FAB -->
    <button class="cw-fab" [class.hidden]="open" (click)="toggle()" aria-label="KI-Assistent öffnen" title="KI-Assistent">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
      </svg>
    </button>

    <!-- Panel -->
    <div class="cw-panel" [class.open]="open" role="dialog" aria-label="KI-Assistent">
      <header class="cw-head">
        <span class="cw-title">
          <span class="cw-dot"></span> KI-Assistent
        </span>
        <div class="cw-head-actions">
          <button class="cw-icon" [class.on]="showHistory" (click)="toggleHistory()" title="Verlauf" aria-label="Verlauf">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l3 2"/></svg>
          </button>
          <button class="cw-icon" (click)="newChat()" title="Neuer Chat" aria-label="Neuer Chat">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <a class="cw-icon" href="/chat" title="Im Vollbild öffnen" (click)="goFull($event)" aria-label="Vollbild">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
          </a>
          <button class="cw-icon" (click)="close()" aria-label="Schließen">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </header>
      <div class="cw-body">
        <!-- m-chat nur instanziieren wenn schon mal geöffnet (lazy) -->
        <m-chat #chat *ngIf="everOpened"
          [conversationId]="activeConvId"
          (conversationChanged)="onConvChanged($event)"></m-chat>

        <!-- Verlauf-Overlay -->
        <div class="cw-history" *ngIf="showHistory">
          <div class="cw-history-head">
            <span>Verlauf</span>
            <button class="cw-new-btn" (click)="newChat()">+ Neuer Chat</button>
          </div>
          <p *ngIf="!conversations.length" class="cw-history-empty">Noch keine Chats.</p>
          <ul class="cw-history-list">
            <li *ngFor="let c of conversations" [class.active]="c.id === activeConvId">
              <button class="cw-history-item" (click)="openConversation(c.id)">
                <span class="cw-history-title">{{ c.title || '(unbenannt)' }}</span>
                <span class="cw-history-meta">{{ c.turnCount }} Nachrichten · {{ c.updatedAt | date:'dd.MM. HH:mm' }}</span>
              </button>
              <button class="cw-history-arch" (click)="archive(c.id, $event)" title="Archivieren" aria-label="Archivieren">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
   </ng-container>
  `,
  styles: [`
    :host { display: contents; }

    .cw-fab {
      position: fixed;
      bottom: 1.25rem;
      right: 1.25rem;
      z-index: 920;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      border: none;
      background: #1A1A1A;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 14px rgba(0,0,0,0.22);
      transition: transform 0.12s, background 0.15s, opacity 0.15s;
      &:hover { background: #000; transform: translateY(-2px); }
      &:active { transform: scale(0.95); }
      &.hidden { opacity: 0; pointer-events: none; transform: scale(0.8); }
    }

    .cw-panel {
      position: fixed;
      bottom: 1.25rem;
      right: 1.25rem;
      z-index: 921;
      width: 400px;
      max-width: calc(100vw - 2rem);
      height: 640px;
      max-height: calc(100vh - 2.5rem);
      background: white;
      border: 1px solid #E5E5E5;
      border-radius: 10px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.20);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform-origin: bottom right;
      transform: translateY(12px) scale(0.96);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.18s cubic-bezier(0.4,0,0.2,1), opacity 0.18s;
      &.open { transform: translateY(0) scale(1); opacity: 1; pointer-events: auto; }
    }
    .cw-head {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.7rem 0.85rem 0.7rem 1rem;
      background: #1A1A1A;
      color: white;
    }
    .cw-title {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-family: system-ui, -apple-system, sans-serif;
      font-weight: 600;
      font-size: 0.95rem;
    }
    .cw-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #4ADE80; box-shadow: 0 0 0 3px rgba(74,222,128,0.25);
    }
    .cw-head-actions { display: flex; align-items: center; gap: 0.1rem; }
    .cw-icon {
      background: transparent;
      border: none;
      color: rgba(255,255,255,0.7);
      cursor: pointer;
      padding: 0.3rem;
      border-radius: 5px;
      display: flex;
      align-items: center;
      text-decoration: none;
      &:hover { color: white; background: rgba(255,255,255,0.12); }
      &.on { color: white; background: rgba(255,255,255,0.18); }
    }
    .cw-body {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      padding: 0 0.85rem;
      position: relative;
      --m-composer-bg: #ffffff;
    }
    // ── Verlauf-Overlay (deckt den Chat ab) ──
    .cw-history {
      position: absolute;
      inset: 0;
      background: white;
      display: flex;
      flex-direction: column;
      font-family: system-ui, -apple-system, sans-serif;
      z-index: 5;
    }
    .cw-history-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.85rem 0.3rem 0.7rem;
      flex-shrink: 0;
      span { font-weight: 600; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: #999; }
    }
    .cw-new-btn {
      display: inline-flex; align-items: center; gap: 0.3rem;
      background: #1A1A1A;
      color: white;
      border: none;
      font-size: 0.8rem;
      font-weight: 500;
      padding: 0.4rem 0.75rem;
      border-radius: 7px;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
      &:hover { background: #000; }
      &:active { transform: scale(0.97); }
    }
    .cw-history-empty {
      color: #999; font-size: 0.85rem; line-height: 1.5;
      padding: 1.25rem 0.3rem; text-align: center;
    }
    .cw-history-list {
      list-style: none; padding: 0 0 0.5rem; margin: 0;
      overflow-y: auto; flex: 1;
      display: flex; flex-direction: column; gap: 0.1rem;
    }
    .cw-history-list li {
      display: flex; align-items: stretch; border-radius: 8px;
      transition: background 0.12s;
      .cw-history-arch { opacity: 0; }
      &:hover { background: #F2F2F2; .cw-history-arch { opacity: 1; } }
      &.active { background: #1A1A1A;
        .cw-history-title { color: #fff; font-weight: 600; }
        .cw-history-meta { color: rgba(255,255,255,0.6); }
        .cw-history-arch { color: rgba(255,255,255,0.6); }
      }
    }
    .cw-history-item {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 0.15rem;
      background: transparent; border: none; text-align: left;
      padding: 0.55rem 0.6rem; cursor: pointer; font-family: inherit;
      .cw-history-title {
        font-size: 0.88rem; color: #1A1A1A; font-weight: 500;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .cw-history-meta { font-size: 0.7rem; color: #9A9A9A; }
    }
    .cw-history-arch {
      background: transparent; border: none; color: #BBB; cursor: pointer;
      padding: 0 0.6rem; display: flex; align-items: center;
      transition: opacity 0.15s, color 0.15s;
      &:hover { color: #c92100 !important; }
    }
    // ── Kompakt-Overrides nur fürs schmale Widget (scoped, /chat-Vollbild
    //    + Mobile bleiben unberührt) ──
    .cw-body ::ng-deep {
      m-chat { height: 100%; }
      .m-chat { max-width: none; }
      .m-chat-header { display: none; }              // Widget hat eigenen Header
      .m-chat-msgs { gap: 1.15rem; padding-top: 0.5rem; }
      // Intro kompakter
      .m-chat-intro { padding: 0.5rem 0 0.5rem; }
      .m-intro-greet { font-size: 1.15rem; margin-bottom: 0.25rem; }
      .m-intro-sub { font-size: 0.84rem; margin-bottom: 1.1rem; max-width: none; }
      .m-intro-group { margin-bottom: 0.85rem; }
      .m-intro-label { font-size: 0.68rem; margin-bottom: 0.35rem; }
      .m-intro-chips { gap: 0.35rem; }
      .m-intro-chips button { font-size: 0.8rem; padding: 0.32rem 0.65rem; }
      // Messages kompakter
      .m-avatar { width: 24px; height: 24px; }
      .m-assistant-row { gap: 0.55rem; }
      .m-chat-text { font-size: 0.9rem; line-height: 1.55; }
      .m-user-bubble { font-size: 0.9rem; max-width: 85%; }
      .m-chat-text table { font-size: 0.8rem; }
      .m-chat-text th, .m-chat-text td { padding: 0.4rem 0.5rem; }
      // Composer kompakter, Hinweis weg
      .m-composer { padding: 0.4rem 0 0.3rem; }
      .m-composer-hint { display: none; }
      .m-composer-box { gap: 0.2rem; padding: 0.25rem 0.3rem 0.25rem 0.35rem; }
      .m-composer-box input { font-size: 0.9rem; min-height: 36px; padding: 0.4rem 0.35rem; }
      .m-composer-box .m-send { width: 34px; height: 34px; }
      // Agent-Toggle im engen Fenster: nur Icons (Labels weg), aktiver hervorgehoben
      .m-agent-inline { padding-right: 0.25rem; }
      .m-agent-inline button { padding: 0.32rem 0.38rem; }
      .m-agent-inline button span { display: none; }
    }

    @media (max-width: 620px) {
      .cw-panel {
        width: auto;
        left: 0.75rem;
        right: 0.75rem;
        bottom: 0.75rem;
        height: auto;
        top: 0.75rem;
        max-height: none;
      }
    }
  `],
})
export class ChatWidgetComponent {
  @ViewChild('chat') chat?: MChatComponent;
  open = false;
  everOpened = false;
  showHistory = false;
  conversations: ConvSummary[] = [];
  activeConvId: string | null = null;
  /** Auf der /chat-Vollbildseite blenden wir das Widget aus (Doppelung). */
  onChatRoute = false;

  constructor(private http: HttpClient, private router: Router) {
    this.onChatRoute = this.router.url.startsWith('/chat');
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.onChatRoute = e.urlAfterRedirects.startsWith('/chat');
        if (this.onChatRoute) this.open = false;
      });
  }

  toggle() {
    this.open = !this.open;
    if (this.open) this.everOpened = true;
  }
  close() { this.open = false; this.showHistory = false; }

  newChat() {
    this.activeConvId = null;
    this.showHistory = false;
    this.chat?.reset();
  }

  async toggleHistory() {
    this.showHistory = !this.showHistory;
    if (this.showHistory) await this.loadConversations();
  }

  private async loadConversations() {
    try {
      const res = await firstValueFrom(
        this.http.get<{ conversations: ConvSummary[] }>('/api/llm/conversations'),
      );
      this.conversations = res.conversations ?? [];
    } catch {
      this.conversations = [];
    }
  }

  openConversation(id: string) {
    this.activeConvId = id;     // m-chat lädt via ngOnChanges nach
    this.showHistory = false;
  }

  /** Wird vom m-chat emittet wenn der Server eine Conversation anlegt/umbenennt. */
  onConvChanged(info: { id: string; title: string }) {
    if (info?.id) this.activeConvId = info.id;
  }

  async archive(id: string, ev: Event) {
    ev.stopPropagation();
    try {
      await firstValueFrom(this.http.delete(`/api/llm/conversation?id=${encodeURIComponent(id)}`));
      this.conversations = this.conversations.filter((c) => c.id !== id);
      if (id === this.activeConvId) this.newChat();
    } catch { /* ignore */ }
  }

  goFull(ev: Event) {
    ev.preventDefault();
    this.close();
    // Hard-Navigate zum Vollbild-Chat
    window.location.href = '/chat';
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.showHistory) { this.showHistory = false; return; }
    if (this.open) this.close();
  }
}
