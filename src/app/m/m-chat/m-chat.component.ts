import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import { remult } from 'remult';
import { CompanySettings } from '../../../shared/entities/company-settings';
import { markdownToHtml } from '../../core/markdown.util';

interface InvoiceProposalItem {
  name: string;
  description?: string;
  quantity: number;
  amountType: string;
  price: number;
  vat: number;
}
interface InvoiceProposal {
  kind: 'invoice';
  customerId: string;
  customerName: string;
  subject?: string;
  items: InvoiceProposalItem[];
  netTotal: number;
  grossTotal: number;
}
interface TimeEntryProposal {
  kind: 'time_entry';
  projectId: string;
  projectName: string;
  date: string;
  hours: number;
  hourlyRate: number;
  amount: number;
  description?: string;
}
interface ExpenseProposal {
  kind: 'expense';
  date: string;
  netTotal: number;
  vatRate: number;
  grossTotal: number;
  category: string;
  vendor?: string;
  description?: string;
}
interface PersonProposal {
  kind: 'person';
  firstname: string;
  lastname: string;
  salutation?: string;
  email?: string;
  phone?: string;
  vatId?: string;
  address?: { street: string; zip: string; city: string; country: string } | null;
}
interface CompanyProposal {
  kind: 'company';
  name: string;
  nameAddon?: string;
  email?: string;
  phone?: string;
  vatId?: string;
  address?: { street: string; zip: string; city: string; country: string } | null;
}
interface ReminderProposal {
  kind: 'reminder';
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  stage: 1 | 2 | 3;
  stageLabel: string;
  reminderDate: string;
  dueDate: string;
  daysOverdue: number;
  invoiceGross: number;
  interestRate: number;
  interestAmount: number;
  reminderFee: number;
  totalDue: number;
}
interface SettingProposal {
  kind: 'setting';
  key: string;
  value: any;
  label: string;
  displayValue: string;
}
type Proposal = InvoiceProposal | TimeEntryProposal | ExpenseProposal | PersonProposal | CompanyProposal | ReminderProposal | SettingProposal;

interface LiveTool {
  name: string;
  label: string;
  done: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
  streaming?: boolean;
  toolTrace?: { name: string; args: any; result?: any }[];
  liveTools?: LiveTool[];
  proposals?: Proposal[];
  proposalsExecuted?: boolean;
  configAction?: { label: string; routerLink: string };
}

type AgentId = 'accountant' | 'support';

@Component({
  selector: 'm-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="m-chat">
      <div class="m-chat-header" *ngIf="history.length">
        <span class="m-chat-status">
          <span class="dot-on"></span> {{ agentId === 'support' ? supportName : accountantName }} · {{ history.length }} Nachrichten
        </span>
        <button type="button" class="m-chat-newchat" (click)="reset()" [disabled]="busy">
          ↻ Neuer Chat
        </button>
      </div>
      <div class="m-chat-msgs" #msgs>
        <div *ngIf="!history.length" class="m-chat-intro">
          <ng-container *ngIf="agentId === 'accountant'">
            <div class="m-intro-greet">Hallo. Was darf's sein?</div>
            <p class="m-intro-sub">Sprich mit mir wie mit einem Mitarbeiter — frag, lass buchen, lass anlegen.</p>

            <div class="m-intro-group">
              <div class="m-intro-label">Fragen</div>
              <div class="m-intro-chips">
                <button (click)="ask('Wie viele Kunden haben wir?')">Wie viele Kunden?</button>
                <button (click)="ask('Welche Außenstände habe ich?')">Außenstände</button>
                <button (click)="ask('Top 5 Kunden 2026')">Top-Kunden 2026</button>
                <button (click)="ask('Wie viel UVA für Mai?')">UVA Mai</button>
              </div>
            </div>

            <div class="m-intro-group">
              <div class="m-intro-label">Anlegen</div>
              <div class="m-intro-chips">
                <button (click)="ask('Leg einen neuen Kunden an: ')">Neuer Kunde</button>
                <button (click)="ask('Schreib eine Rechnung an … über … €')">Neue Rechnung</button>
                <button (click)="ask('Buche heute 2h auf Projekt …')">Stunden buchen</button>
              </div>
            </div>

            <div class="m-intro-group">
              <div class="m-intro-label">Mahnen</div>
              <div class="m-intro-chips">
                <button (click)="ask('Welche Rechnungen sind überfällig?')">Überfällige</button>
                <button (click)="ask('Mahne … (Stufe 1)')">Mahn-Entwurf</button>
              </div>
            </div>
          </ng-container>

          <ng-container *ngIf="agentId === 'support'">
            <div class="m-intro-greet">Support — wie kann ich helfen?</div>
            <p class="m-intro-sub">Ich kenne die App. Frag mich wo etwas eingestellt wird, ich erkläre und bring dich direkt hin.</p>

            <div class="m-intro-group">
              <div class="m-intro-label">Einstellen</div>
              <div class="m-intro-chips">
                <button (click)="ask('Wie aktiviere ich den Kleinunternehmer-Status?')">Kleinunternehmer</button>
                <button (click)="ask('Wo trage ich meine IBAN ein?')">IBAN eintragen</button>
                <button (click)="ask('Wie ändere ich das Rechnungsnummern-Format?')">Nummernkreis</button>
                <button (click)="ask('Wie aktiviere ich das Mahnwesen?')">Mahnwesen aktivieren</button>
              </div>
            </div>

            <div class="m-intro-group">
              <div class="m-intro-label">Finden</div>
              <div class="m-intro-chips">
                <button (click)="ask('Wo sehe ich meine offenen Rechnungen?')">Offene Rechnungen</button>
                <button (click)="ask('Wo mache ich die USt-Voranmeldung?')">UVA</button>
                <button (click)="ask('Wie funktioniert der Bank-Abgleich?')">Bank-Abgleich</button>
              </div>
            </div>
          </ng-container>
        </div>

        <div *ngFor="let m of history" class="m-chat-msg" [class.user]="m.role === 'user'" [class.assistant]="m.role !== 'user'" [class.error]="m.error">
          <!-- USER: dezente Bubble, rechtsbündig -->
          <div *ngIf="m.role === 'user'" class="m-user-bubble">{{ m.content }}</div>

          <!-- ASSISTANT: Avatar links + Full-Width-Text (ChatGPT/Claude-Style) -->
          <div *ngIf="m.role !== 'user'" class="m-assistant-row">
            <div class="m-avatar" [class.support]="agentId === 'support'" aria-hidden="true">
              <!-- Avatar spiegelt den aktiven Agenten (gleiche Icons wie der Toggle) -->
              <svg *ngIf="agentId === 'support'" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14h3a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2v-6a9 9 0 0 1 18 0v6a2 2 0 0 1-2 2h-1a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3"/><path d="M21 17v1a4 4 0 0 1-4 4h-5"/></svg>
              <svg *ngIf="agentId !== 'support'" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10"/><line x1="12" y1="10" x2="12" y2="10"/><line x1="16" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="8" y2="14"/><line x1="12" y1="14" x2="12" y2="14"/><line x1="16" y1="14" x2="16" y2="18"/><line x1="8" y1="18" x2="12" y2="18"/></svg>
            </div>
            <div class="m-assistant-content">
              <!-- Live-Tool-Calls (während des Streamings) -->
              <div *ngIf="m.liveTools?.length" class="m-live-tools">
                <span *ngFor="let lt of m.liveTools" class="m-live-tool" [class.done]="lt.done">
                  <span class="m-live-spin" *ngIf="!lt.done"></span>
                  <span class="m-live-check" *ngIf="lt.done">✓</span>
                  {{ lt.label }}
                </span>
              </div>
              <!-- Persistierte Tool-Trace (nach Reload) -->
              <div *ngIf="!m.liveTools?.length && m.toolTrace?.length" class="m-chat-tools">
                <span *ngFor="let t of m.toolTrace" class="m-chat-tool">⚙ {{ t.name }}</span>
              </div>
              <!-- Streaming: Denk-Punkte bis 1. Token, dann LIVE-Markdown (uncached) -->
              <div *ngIf="!m.configAction && m.streaming && m.content" class="m-chat-text live" (click)="onContentClick($event)" [innerHTML]="renderMd(m.content, false)"></div>
              <div *ngIf="!m.configAction && m.streaming && !m.content" class="m-chat-busy">
                <span class="dot"></span><span class="dot"></span><span class="dot"></span>
              </div>
              <div *ngIf="!m.configAction && !m.streaming" class="m-chat-text" [class.error-text]="m.error" (click)="onContentClick($event)" [innerHTML]="renderMd(m.content)"></div>

              <div *ngIf="m.configAction" class="m-config-card">
                <div class="m-config-icon">⚙</div>
                <div class="m-config-body">
                  <div class="m-config-title">KI-Assistent nicht einsatzbereit</div>
                  <div class="m-config-msg">{{ m.content }}</div>
                  <a class="m-pill m-pill-primary" [routerLink]="m.configAction.routerLink">
                    {{ m.configAction.label }} →
                  </a>
                </div>
              </div>

              <div *ngFor="let p of m.proposals" class="m-chat-proposal">
            <ng-container *ngIf="p.kind === 'invoice'">
              <div class="m-prop-head">💡 Rechnungs-Entwurf an <strong>{{ $any(p).customerName }}</strong></div>
              <div class="m-prop-body" *ngIf="$any(p).subject">{{ $any(p).subject }}</div>
              <ul class="m-prop-items">
                <li *ngFor="let it of $any(p).items">
                  {{ it.quantity }} {{ it.amountType }} · {{ it.name }} — {{ it.price | currency:'EUR':'symbol':'1.2-2':'de-AT' }}
                </li>
              </ul>
              <div class="m-prop-sum">
                Netto {{ $any(p).netTotal | currency:'EUR':'symbol':'1.2-2':'de-AT' }} ·
                Brutto {{ $any(p).grossTotal | currency:'EUR':'symbol':'1.2-2':'de-AT' }}
              </div>
            </ng-container>

            <ng-container *ngIf="p.kind === 'time_entry'">
              <div class="m-prop-head">⏱ Zeitbuchungs-Entwurf auf <strong>{{ $any(p).projectName }}</strong></div>
              <div class="m-prop-body">
                {{ $any(p).hours | number:'1.1-2':'de-AT' }} h ·
                {{ $any(p).date | date:'dd.MM.yyyy' }} ·
                {{ $any(p).amount | currency:'EUR':'symbol':'1.2-2':'de-AT' }}
              </div>
              <div class="m-prop-body" *ngIf="$any(p).description">{{ $any(p).description }}</div>
            </ng-container>

            <ng-container *ngIf="p.kind === 'expense'">
              <div class="m-prop-head">📥 Ausgaben-Entwurf · <strong>{{ $any(p).category }}</strong></div>
              <div class="m-prop-body">
                {{ $any(p).netTotal | currency:'EUR':'symbol':'1.2-2':'de-AT' }} netto +
                {{ $any(p).vatRate }} % USt → {{ $any(p).grossTotal | currency:'EUR':'symbol':'1.2-2':'de-AT' }}
              </div>
              <div class="m-prop-body" *ngIf="$any(p).vendor">{{ $any(p).vendor }}</div>
            </ng-container>

            <ng-container *ngIf="p.kind === 'person'">
              <div class="m-prop-head">👤 Neue Person · <strong>{{ $any(p).salutation }} {{ $any(p).firstname }} {{ $any(p).lastname }}</strong></div>
              <div class="m-prop-body" *ngIf="$any(p).address">
                {{ $any(p).address.street }} · {{ $any(p).address.zip }} {{ $any(p).address.city }} · {{ $any(p).address.country }}
              </div>
              <div class="m-prop-body" *ngIf="$any(p).email">{{ $any(p).email }}</div>
              <div class="m-prop-body" *ngIf="$any(p).vatId">UID: {{ $any(p).vatId }}</div>
            </ng-container>

            <ng-container *ngIf="p.kind === 'company'">
              <div class="m-prop-head">🏢 Neue Firma · <strong>{{ $any(p).name }} {{ $any(p).nameAddon }}</strong></div>
              <div class="m-prop-body" *ngIf="$any(p).address">
                {{ $any(p).address.street }} · {{ $any(p).address.zip }} {{ $any(p).address.city }} · {{ $any(p).address.country }}
              </div>
              <div class="m-prop-body" *ngIf="$any(p).email">{{ $any(p).email }}</div>
              <div class="m-prop-body" *ngIf="$any(p).vatId">UID: {{ $any(p).vatId }}</div>
            </ng-container>

            <ng-container *ngIf="p.kind === 'reminder'">
              <div class="m-prop-head">⚠ {{ $any(p).stageLabel }} · Rechnung <strong>{{ $any(p).invoiceNumber }}</strong></div>
              <div class="m-prop-body">an <strong>{{ $any(p).customerName }}</strong></div>
              <ul class="m-prop-items">
                <li>Rechnungsbetrag: {{ $any(p).invoiceGross | currency:'EUR':'symbol':'1.2-2':'de-AT' }}</li>
                <li *ngIf="$any(p).interestAmount > 0">+ Verzugszinsen ({{ $any(p).interestRate }} % p.a., {{ $any(p).daysOverdue }} Tg): {{ $any(p).interestAmount | currency:'EUR':'symbol':'1.2-2':'de-AT' }}</li>
                <li *ngIf="$any(p).reminderFee > 0">+ Mahnspesen: {{ $any(p).reminderFee | currency:'EUR':'symbol':'1.2-2':'de-AT' }}</li>
              </ul>
              <div class="m-prop-sum">
                Gesamtforderung: {{ $any(p).totalDue | currency:'EUR':'symbol':'1.2-2':'de-AT' }} ·
                Frist bis: {{ $any(p).dueDate | date:'dd.MM.yyyy' }}
              </div>
            </ng-container>

            <ng-container *ngIf="p.kind === 'setting'">
              <div class="m-prop-head">⚙ Einstellung ändern · <strong>{{ $any(p).label }}</strong></div>
              <div class="m-prop-body">Neuer Wert: <strong>{{ $any(p).displayValue }}</strong></div>
            </ng-container>

            <div class="m-prop-actions" *ngIf="!m.proposalsExecuted">
              <button type="button" class="m-pill" (click)="dismissProposal(m, p)" [disabled]="executing">Verwerfen</button>
              <button type="button" class="m-pill m-pill-primary" (click)="executeProposal(m, p)" [disabled]="executing">
                {{ executing ? 'Speichert…' : 'Bestätigen' }}
              </button>
            </div>
            <div class="m-prop-done" *ngIf="m.proposalsExecuted">✓ angelegt</div>
          </div>
            </div>
          </div>
        </div>

      </div>

      <form class="m-composer" (ngSubmit)="send()">
        <div class="m-composer-box">
          <!-- Agent-Toggle links im Eingabefeld; aktiver Agent zeigt sein Label -->
          <div class="m-agent-inline">
            <button type="button" [class.active]="agentId === 'accountant'" (click)="setAgent('accountant')" [disabled]="busy" [title]="accountantName + ' — Buchhaltung, Rechnungen, Abfragen'">
              <!-- Taschenrechner -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10"/><line x1="12" y1="10" x2="12" y2="10"/><line x1="16" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="8" y2="14"/><line x1="12" y1="14" x2="12" y2="14"/><line x1="16" y1="14" x2="16" y2="18"/><line x1="8" y1="18" x2="12" y2="18"/></svg>
              <span *ngIf="agentId === 'accountant'">{{ accountantName }}</span>
            </button>
            <button type="button" [class.active]="agentId === 'support'" (click)="setAgent('support')" [disabled]="busy" [title]="supportName + ' — Hilfe zur App, Einstellungen, Navigation'">
              <!-- Headset (Support / Hotline) -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14h3a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2v-6a9 9 0 0 1 18 0v6a2 2 0 0 1-2 2h-1a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3"/><path d="M21 17v1a4 4 0 0 1-4 4h-5"/></svg>
              <span *ngIf="agentId === 'support'">{{ supportName }}</span>
            </button>
          </div>
          <input
            type="text"
            [(ngModel)]="draft"
            name="draft"
            placeholder="Nachricht eingeben…"
            [disabled]="busy"
            autocomplete="off"
          />
          <button type="submit" class="m-send" [disabled]="busy || !draft.trim()" aria-label="Senden">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14M13 5l7 7-7 7"/>
            </svg>
          </button>
        </div>
        <div class="m-composer-hint">Der KI-Assistent kann Fehler machen — Vorschläge vor dem Bestätigen prüfen.</div>
      </form>
    </div>
  `,
  styles: [`
    // Host trägt die Höhe (mobil: minus Topbar). Desktop/Widget überschreiben
    // den Host auf height:100%. So bleibt der Composer immer am unteren Rand.
    :host {
      display: flex;
      flex-direction: column;
      height: calc(100dvh - var(--m-topbar-h, 56px) - env(safe-area-inset-top) - env(safe-area-inset-bottom));
      min-height: 0;
    }
    .m-chat {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      max-width: 760px;
      margin: 0 auto;
      width: 100%;
    }
    .m-chat-header { flex-shrink: 0; }
    // ─── Agent-Toggle inline im Eingabefeld (links vom Senden-Pfeil) ──
    .m-agent-inline {
      display: inline-flex;
      gap: 0.1rem;
      flex-shrink: 0;
      align-self: stretch;
      align-items: center;
      padding-right: 0.3rem;
      margin-right: 0.1rem;
      border-right: 1px solid #ECECEC;
      button {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        border: none;
        background: transparent;
        color: #999;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 0.8rem;
        font-weight: 500;
        padding: 0.32rem 0.5rem;
        border-radius: 5px;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.15s, color 0.15s;
        svg { flex-shrink: 0; }
        &:hover:not(.active):not(:disabled) { color: #1A1A1A; background: #F2F2F2; }
        &.active {
          background: #1A1A1A;
          color: white;
        }
        &:disabled { cursor: not-allowed; opacity: 0.6; }
      }
    }
    // ─── Live-Tool-Calls (während Streaming) ─────────────────────────
    .m-live-tools {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      margin-bottom: 0.6rem;
    }
    .m-live-tool {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      align-self: flex-start;
      font-size: 0.8rem;
      color: #666;
      background: #F4F4F4;
      padding: 0.3rem 0.65rem;
      border-radius: 4px;
      font-family: system-ui, -apple-system, sans-serif;
      transition: color 0.2s, background 0.2s;
      &.done { color: #266100; background: #EFF6EC; }
    }
    .m-live-spin {
      width: 11px;
      height: 11px;
      border: 2px solid #CCC;
      border-top-color: #666;
      border-radius: 50%;
      animation: m-spin 0.7s linear infinite;
    }
    @keyframes m-spin { to { transform: rotate(360deg); } }
    .m-live-check { color: #266100; font-weight: 700; font-size: 0.85rem; line-height: 1; }
    // ─── Streaming-Cursor ────────────────────────────────────────────
    .m-chat-text.streaming { white-space: pre-wrap; }
    .m-cursor {
      display: inline-block;
      width: 7px;
      height: 1.05em;
      background: #1A1A1A;
      margin-left: 1px;
      vertical-align: text-bottom;
      animation: m-blink 1s step-start infinite;
    }
    @keyframes m-blink { 50% { opacity: 0; } }
    // ─── Header-Bar mit Status + Neuer-Chat ──────────────────────────
    .m-chat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.4rem 0 0.85rem;
      margin-bottom: 0.5rem;
      border-bottom: 1px solid #ECECEC;
    }
    .m-chat-status {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.78rem;
      color: #888;
      font-family: system-ui, -apple-system, sans-serif;
      .dot-on {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #2D9A41;
        box-shadow: 0 0 0 3px rgba(45, 154, 65, 0.18);
        animation: pulse-on 2.4s ease-in-out infinite;
      }
    }
    @keyframes pulse-on {
      0%, 100% { opacity: 0.85; }
      50% { opacity: 1; }
    }
    .m-chat-newchat {
      background: transparent;
      border: 1px solid #DDD;
      color: #444;
      font-size: 0.82rem;
      padding: 0.35rem 0.75rem;
      border-radius: 999px;
      cursor: pointer;
      font-family: inherit;
      transition: border-color 0.15s, color 0.15s, background 0.15s;
      &:hover:not(:disabled) {
        border-color: #1A1A1A;
        color: #1A1A1A;
        background: #FAFAFA;
      }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }

    .m-chat-msgs {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1.6rem;
      padding-bottom: 1rem;
    }

    // ─── Welcome / Intro ─────────────────────────────────────────────
    .m-chat-intro {
      padding: 1rem 0 2rem;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .m-intro-greet {
      font-size: 1.5rem;
      font-weight: 600;
      color: #111;
      letter-spacing: -0.02em;
      margin-bottom: 0.35rem;
    }
    .m-intro-sub {
      color: #888;
      margin: 0 0 1.75rem;
      font-size: 0.92rem;
      max-width: 460px;
    }
    .m-intro-group {
      margin-bottom: 1.25rem;
      &:last-child { margin-bottom: 0; }
    }
    .m-intro-label {
      font-size: 0.72rem;
      color: #888;
      font-weight: 500;
      letter-spacing: 0.03em;
      margin-bottom: 0.45rem;
      text-transform: uppercase;
    }
    .m-intro-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      button {
        background: white;
        border: 1px solid #E5E5E5;
        border-radius: 999px;
        padding: 0.4rem 0.85rem;
        font-size: 0.85rem;
        color: #1A1A1A;
        cursor: pointer;
        font-family: inherit;
        transition: border-color 0.15s, background 0.15s, transform 0.1s;
        &:hover {
          border-color: #1A1A1A;
          background: #FAFAFA;
        }
        &:active { transform: scale(0.97); }
      }
    }
    .m-chat-msg {
      display: flex;
      flex-direction: column;
      &.user { align-items: flex-end; }
    }
    .m-chat-tools {
      display: flex;
      gap: 0.35rem;
      flex-wrap: wrap;
      margin-bottom: 0.5rem;
    }
    .m-chat-tool {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.7rem;
      background: #F4F4F4;
      color: #666;
      padding: 2px 8px;
      border-radius: 999px;
      font-family: 'SF Mono', Menlo, Consolas, monospace;
      font-weight: 500;
      letter-spacing: 0.01em;
      &::before {
        content: '';
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #888;
      }
    }

    // ─── USER: dezente Bubble rechtsbündig (ChatGPT-Style) ───────────
    .m-user-bubble {
      max-width: 80%;
      background: #F0F0F0;
      color: #1A1A1A;
      padding: 0.6rem 0.9rem;
      border-radius: 4px;
      font-size: 0.95rem;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    // ─── ASSISTANT: Avatar links + Full-Width-Text, keine Bubble ─────
    .m-assistant-row {
      display: flex;
      gap: 0.8rem;
      align-items: flex-start;
      width: 100%;
    }
    .m-avatar {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #1A1A1A;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 1px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.06);
    }
    .m-assistant-content {
      flex: 1;
      min-width: 0;
    }
    .m-chat-text {
      font-size: 0.95rem;
      line-height: 1.62;
      color: #1A1A1A;
      word-wrap: break-word;

      &.error-text { color: #9F1239; }
    }
    // WICHTIG: Der Markdown-Inhalt kommt per [innerHTML] rein — Angulars
    // View-Encapsulation greift dort NICHT. Darum die Inhalts-Styles mit
    // ::ng-deep durchstechen, sonst fehlen z.B. die Tabellen-Rahmenlinien.
    :host ::ng-deep .m-chat-text {
      :first-child { margin-top: 0; }
      :last-child { margin-bottom: 0; }
      p { margin: 0 0 0.65rem; }
      p:last-child { margin-bottom: 0; }
      strong { font-weight: 700; }
      em { font-style: italic; }
      a {
        color: #1A1A1A;
        text-decoration: underline;
        text-underline-offset: 2px;
        text-decoration-color: #BBB;
        font-weight: 500;
        cursor: pointer;
      }
      a:hover { text-decoration-color: #1A1A1A; }
      code {
        font-family: 'SF Mono', Menlo, Consolas, monospace;
        font-size: 0.85em;
        background: rgba(0, 0, 0, 0.06);
        padding: 1px 5px;
        border-radius: 4px;
      }
      ul, ol { margin: 0.4rem 0 0.65rem; padding-left: 1.3rem; }
      li { margin: 0.15rem 0; }
      h3, h4, h5, h6 {
        font-family: Georgia, 'Times New Roman', serif;
        font-weight: 600;
        margin: 0.85rem 0 0.4rem;
        line-height: 1.25;
      }
      h3 { font-size: 1.1rem; }
      h4 { font-size: 1rem; }
      h5, h6 { font-size: 0.95rem; }

      // Tabellen mit vollen Rasterlinien + gerundeten Außenecken
      // (Stil wie claude.ai / llama.cpp-webui).
      table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        margin: 0.75rem 0;
        font-size: 0.875rem;
        border: 1px solid #E0E0E0;
        border-radius: 4px;
        overflow: hidden;
      }
      th, td {
        padding: 0.5rem 0.7rem;
        text-align: left;
        vertical-align: top;
        border-bottom: 1px solid #ECECEC;
        border-right: 1px solid #ECECEC;
      }
      th:last-child, td:last-child { border-right: none; }
      tbody tr:last-child td { border-bottom: none; }
      thead th {
        background: #F6F6F6;
        font-weight: 600;
        color: #1A1A1A;
        border-bottom: 1px solid #E0E0E0;
        white-space: nowrap;
      }
      tbody tr:nth-child(even) { background: #FAFAFA; }
      td { font-variant-numeric: tabular-nums; }

      pre {
        background: #F7F7F7;
        border: 1px solid #ECECEC;
        padding: 0.7rem 0.85rem;
        border-radius: 4px;
        font-family: 'SF Mono', Menlo, Consolas, monospace;
        font-size: 0.82rem;
        overflow-x: auto;
        margin: 0.5rem 0;
      }
      pre code { background: none; padding: 0; font-size: inherit; }
    }
    .m-chat-busy {
      display: inline-flex;
      gap: 0.3rem;
      align-items: center;
      padding: 0.35rem 0;
      .dot {
        width: 7px;
        height: 7px;
        background: #888;
        border-radius: 50%;
        animation: typing 1.2s infinite ease-in-out both;
      }
      .dot:nth-child(1) { animation-delay: -0.32s; }
      .dot:nth-child(2) { animation-delay: -0.16s; }
    }
    @keyframes typing {
      0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
      40% { opacity: 1; transform: translateY(-2px); }
    }

    // ─── Proposal-Card (Bestätigungs-Karte) ─────────────────────────
    .m-chat-proposal {
      background: white;
      border: 1px solid #ECECEC;
      border-radius: 4px;
      padding: 0.9rem 1rem;
      margin-top: 0.5rem;
      font-size: 0.92rem;
      color: #1A1A1A;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
      position: relative;
      overflow: hidden;
    }
    // Top-Accent-Streifen je nach Kind
    .m-chat-proposal::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, #1A1A1A 0%, #4A4A4A 100%);
    }
    .m-prop-head {
      font-weight: 600;
      font-size: 0.92rem;
      margin-bottom: 0.5rem;
      color: #111;
      letter-spacing: -0.01em;
    }
    .m-prop-body {
      color: #555;
      margin-bottom: 0.35rem;
      font-size: 0.88rem;
    }
    .m-prop-items {
      list-style: none;
      padding: 0;
      margin: 0.35rem 0;
      font-size: 0.85rem;
      li {
        padding: 3px 0;
        color: #555;
        position: relative;
        padding-left: 0.85rem;
        &::before {
          content: '·';
          position: absolute;
          left: 0.2rem;
          color: #BBB;
        }
      }
    }
    .m-prop-sum {
      font-weight: 600;
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid #F0F0F0;
      font-size: 0.92rem;
    }
    .m-prop-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.85rem;
      padding-top: 0.65rem;
      border-top: 1px solid #F5F5F5;
    }

    .m-config-card {
      display: flex;
      gap: 0.85rem;
      padding: 1rem 1.15rem;
      background: #FFF8E8;
      border: 1px solid #E8C97A;
      border-radius: 4px;
      margin: 0.4rem 0;
      .m-config-icon {
        font-size: 1.6rem;
        line-height: 1;
        color: #B97500;
      }
      .m-config-body { flex: 1; }
      .m-config-title {
        font-size: 0.95rem;
        font-weight: 600;
        color: #7D5100;
        margin-bottom: 0.3rem;
      }
      .m-config-msg {
        font-size: 0.88rem;
        color: #5A4400;
        line-height: 1.45;
        margin-bottom: 0.75rem;
      }
    }
    .m-prop-done {
      color: #266100;
      font-weight: 600;
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid #F0F0F0;
      font-size: 0.85rem;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .m-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.5rem 1rem;
      background: white;
      border: 1px solid #DDD;
      border-radius: 3px;
      font-size: 0.85rem;
      color: #444;
      cursor: pointer;
      font-family: inherit;
      font-weight: 500;
      transition: border-color 0.15s, background 0.15s;
      &:hover:not(:disabled) {
        border-color: #1A1A1A;
        color: #1A1A1A;
      }
      &.m-pill-primary {
        background: #1A1A1A;
        color: white;
        border-color: #1A1A1A;
        &:hover:not(:disabled) {
          background: #000;
        }
      }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }

    // ─── Composer (Input) — schwebend, kein Hintergrund-Block ────────
    .m-composer {
      flex-shrink: 0;
      padding: 0.6rem 0 0.4rem;
      background: transparent;
    }
    .m-composer-box {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      background: white;
      border: 1px solid #DADADA;
      border-radius: 6px;
      padding: 0.3rem 0.4rem 0.3rem 0.45rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      transition: border-color 0.15s, box-shadow 0.15s;
      &:focus-within {
        border-color: #1A1A1A;
        box-shadow: 0 0 0 3px rgba(26,26,26,0.06);
      }
      input {
        flex: 1;
        min-width: 0;
        min-height: 42px;
        padding: 0.5rem 0.5rem;
        border: none;
        background: transparent;
        font-size: 0.97rem;
        font-family: inherit;
        color: #1A1A1A;
        &::placeholder { color: #9A9A9A; }
        &:focus { outline: none; }
      }
      .m-send {
        flex-shrink: 0;
        width: 38px;
        height: 38px;
        border-radius: 4px;
        border: none;
        background: #1A1A1A;
        color: white;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s, transform 0.1s;
        &:hover:not(:disabled) { background: #000; }
        &:active:not(:disabled) { transform: scale(0.94); }
        &:disabled { background: #E0E0E0; cursor: not-allowed; }
      }
    }
    .m-composer-hint {
      text-align: center;
      font-size: 0.72rem;
      color: #AAA;
      margin-top: 0.4rem;
      font-family: system-ui, -apple-system, sans-serif;
    }
  `],
})
export class MChatComponent implements OnInit, OnChanges {
  @ViewChild('msgs') msgsEl?: ElementRef<HTMLDivElement>;

  /** Optional explicit Conversation-ID. Wenn gesetzt, lädt + sendet diese
   *  Conversation. Wenn null/'', verwendet jüngste aktive. */
  @Input() conversationId: string | null = null;
  /** Wird emittet wenn der Server eine neue Conversation auto-anlegt oder
   *  Titel ändert — Parent kann seine Liste aktualisieren. */
  @Output() conversationChanged = new EventEmitter<{ id: string; title: string }>();
  /** Wird emittet wenn der User "Neuer Chat" klickt. */
  @Output() conversationReset = new EventEmitter<void>();

  history: ChatMessage[] = [];
  draft = '';
  busy = false;
  executing = false;
  /** Welcher Agent gerade aktiv ist. Umschalten startet einen neuen Chat. */
  agentId: AgentId = 'accountant';
  /** Anzeige-Namen der Agenten (aus Settings, sonst Default-Rolle). */
  accountantName = 'Buchhalter';
  supportName = 'Support';

  private mdCache = new Map<string, SafeHtml>();

  constructor(
    private http: HttpClient,
    private toastr: ToastrService,
    private router: Router,
    private sanitizer: DomSanitizer,
  ) {}

  /**
   * Sehr kleiner Markdown→HTML-Renderer für Chat-Antworten.
   * Unterstützt: **bold**, *italic* / _italic_, `code`, # / ## / ### Headers,
   * Bullet-Listen (- / *), nummerierte Listen (1. ), Zeilenumbrüche.
   * HTML-Inhalt wird vorab escaped — kein XSS-Risiko aus LLM-Output.
   */
  renderMd(src: string, cache = true): SafeHtml {
    if (cache) {
      const cached = this.mdCache.get(src);
      if (cached) return cached;
    }
    // Geteilter Renderer (auch vom Handbuch genutzt) — siehe core/markdown.util.
    const safe = this.sanitizer.bypassSecurityTrustHtml(markdownToHtml(src));
    if (cache) this.mdCache.set(src, safe);
    return safe;
  }

  /**
   * Klick auf einen internen Markdown-Link (a.md-link-internal) → Router-
   * Navigation statt Full-Reload, damit das Chat-Widget offen bleibt und
   * man weiter chatten kann während die Seite wechselt.
   */
  onContentClick(ev: MouseEvent) {
    const a = (ev.target as HTMLElement)?.closest('a.md-link-internal') as HTMLAnchorElement | null;
    if (!a) return;
    ev.preventDefault();
    const href = a.getAttribute('href') || '';
    if (href.startsWith('/')) this.router.navigateByUrl(href);
  }

  ask(prompt: string) {
    this.draft = prompt;
    this.send();
  }

  async ngOnInit() {
    this.loadAgentNames();
    await this.loadHistory();
  }

  /** Lädt die optionalen Agent-Namen aus den Firmen-Einstellungen. */
  private async loadAgentNames() {
    try {
      const s = await remult.repo(CompanySettings).findFirst();
      if (s?.accountantAgentName?.trim()) this.accountantName = s.accountantAgentName.trim();
      if (s?.supportAgentName?.trim()) this.supportName = s.supportAgentName.trim();
    } catch { /* Default-Rollen behalten */ }
  }

  async ngOnChanges(ch: SimpleChanges) {
    if (ch['conversationId'] && !ch['conversationId'].firstChange) {
      await this.loadHistory();
    }
  }

  /**
   * Lädt persistierten Chat-Verlauf vom Server. Extrahiert Proposals aus
   * persistierten Tool-Results und hängt sie an den jeweiligen Assistant-
   * Reply — sonst zeigt die UI nach Reload nur den „bitte bestätigen"-Text
   * ohne die Bestätigungs-Karte selbst.
   */
  private async loadHistory() {
    // Ohne explizite Conversation-ID = frischer Chat (Widget / „Neuer Chat").
    // NICHT die jüngste Konversation laden — sonst landet man in altem Verlauf.
    if (!this.conversationId) {
      this.history = [];
      return;
    }
    try {
      const url = `/api/llm/conversation?id=${encodeURIComponent(this.conversationId)}`;
      const res = await firstValueFrom(
        this.http.get<{ turns: any[]; id?: string; title?: string }>(url),
      );
      // Sync conversationId aus Server-Antwort wenn nicht explizit gesetzt war
      if (!this.conversationId && res.id) {
        this.conversationId = res.id;
      }
      const turns = res.turns ?? [];
      const history: ChatMessage[] = [];

      // Sammle Tool-Results die zwischen zwei Assistant-Turns liegen — sie
      // gehören zur folgenden Assistant-Antwort. Beim Iterieren halten wir
      // einen Buffer und committen ihn bei der nächsten Assistant-Message
      // mit non-empty content.
      let pendingTools: { name: string; args: any; result: any }[] = [];

      for (const t of turns) {
        if (t.role === 'user' && typeof t.content === 'string' && t.content.length) {
          // Neue User-Eingabe → tool-Buffer leeren (gehören zur vorherigen Antwort)
          pendingTools = [];
          history.push({ role: 'user', content: t.content });
          continue;
        }
        if (t.role === 'assistant') {
          // Wenn die Assistant-Message tool_calls hatte (Reuse-Round im Loop)
          // sammeln wir die Namen damit wir sie nachher zum nächsten Tool-Result
          // matchen können.
          if (Array.isArray(t.tool_calls)) {
            for (const tc of t.tool_calls) {
              const name = tc?.function?.name ?? '?';
              let args: any = {};
              try { args = JSON.parse(tc?.function?.arguments ?? '{}'); } catch {}
              pendingTools.push({ name, args, result: null });
            }
          }
          // Final-Text-Antwort → committen
          if (typeof t.content === 'string' && t.content.length) {
            const proposals = pendingTools
              .map((p) => p.result?.proposal)
              .filter(Boolean) as Proposal[];
            history.push({
              role: 'assistant',
              content: t.content,
              toolTrace: pendingTools.length ? [...pendingTools] : undefined,
              proposals: proposals.length ? proposals : undefined,
              // Falls Persistenz später execute-Status mit-trackt: hier setzen
              proposalsExecuted: !!pendingTools.find((p) => p.result?._executed),
            });
            pendingTools = [];
          }
          continue;
        }
        if (t.role === 'tool') {
          // Match auf den jüngsten ungefüllten Tool-Eintrag
          const slot = pendingTools.find((p) => !p.result);
          if (slot) {
            try {
              const parsed = JSON.parse(String(t.content ?? '{}'));
              slot.result = parsed;
            } catch {
              slot.result = { raw: t.content };
            }
          }
          continue;
        }
      }

      this.history = history;
    } catch {
      // LLM-Modul evtl. nicht aktiv — kein History
    }
  }

  /** „Neuer Chat" — emittet nur an Parent; ein neuer Chat wird automatisch
   *  vom Server angelegt sobald die nächste Message kommt. Falls wir explizit
   *  vorab anlegen wollen: Parent ruft POST /api/llm/conversation. */
  async reset() {
    if (this.busy) return;
    this.conversationId = null;
    this.history = [];
    this.draft = '';
    this.conversationReset.emit();
  }

  /** Agent umschalten — startet einen frischen Chat (jeder Agent = eigener Thread). */
  setAgent(id: AgentId) {
    if (this.busy || this.agentId === id) return;
    this.agentId = id;
    this.reset();
  }

  async send() {
    const text = this.draft.trim();
    if (!text || this.busy) return;
    this.draft = '';
    this.history.push({ role: 'user', content: text });

    // Streaming-Platzhalter für die Assistant-Antwort. Wird live befüllt.
    const stream: ChatMessage = { role: 'assistant', content: '', streaming: true, liveTools: [] };
    this.history.push(stream);
    this.busy = true;
    this.scrollDown();

    try {
      const resp = await fetch('/api/llm/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: [{ role: 'user', content: text }],
          persistEnabled: true,
          conversationId: this.conversationId || undefined,
          agentId: this.agentId,
        }),
      });
      if (!resp.ok || !resp.body) {
        // Non-SSE-Fehler (z.B. 500 mit JSON-Body)
        let errBody: any = {};
        try { errBody = await resp.json(); } catch {}
        this.applyError(stream, errBody);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let navigate: { route: string; label: string } | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE-Frames sind durch \n\n getrennt
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);
          if (!frame.startsWith('data:')) continue;
          let evt: any;
          try { evt = JSON.parse(frame.slice(5).trim()); } catch { continue; }

          if (evt.type === 'tool_call') {
            stream.liveTools!.push({ name: evt.name, label: evt.label, done: false });
            this.scrollDown();
          } else if (evt.type === 'tool_result') {
            const lt = [...(stream.liveTools ?? [])].reverse().find((t) => t.name === evt.name && !t.done);
            if (lt) lt.done = true;
          } else if (evt.type === 'token') {
            stream.content += evt.text;
            this.scrollDown();
          } else if (evt.type === 'navigate') {
            navigate = { route: evt.route, label: evt.label };
          } else if (evt.type === 'error') {
            this.applyError(stream, evt);
            return;
          } else if (evt.type === 'done') {
            stream.streaming = false;
            stream.content = evt.reply || stream.content || (evt.proposals?.length ? 'Vorschlag erstellt, bitte bestätigen.' : '');
            stream.toolTrace = evt.toolTrace;
            stream.liveTools = undefined;
            stream.proposals = (evt.proposals?.length ? evt.proposals : undefined);
            if (evt.navigate) navigate = evt.navigate;
            // Conversation-Sync
            if (evt.conversationId && evt.conversationId !== this.conversationId) {
              this.conversationId = evt.conversationId;
              this.conversationChanged.emit({ id: evt.conversationId, title: evt.conversationTitle ?? '' });
            } else if (evt.conversationTitle && evt.conversationId) {
              this.conversationChanged.emit({ id: evt.conversationId, title: evt.conversationTitle });
            }
          }
        }
      }

      // Navigation nach Abschluss ausführen (Support-Agent navigate_to)
      if (navigate) {
        const target = this.resolveNavigationUrl(navigate.route);
        setTimeout(() => this.router.navigateByUrl(target), 600);
      }
    } catch (e: any) {
      this.applyError(stream, { message: e?.message ?? 'Verbindungsfehler' });
    } finally {
      this.busy = false;
      this.scrollDown();
    }
  }

  /** Fehler in die Streaming-Message schreiben (Config-Card oder rote Bubble). */
  private applyError(stream: ChatMessage, err: any) {
    const msg = err?.message ?? err?.error ?? 'Fehler';
    stream.streaming = false;
    stream.liveTools = undefined;
    if (err?.configError) {
      stream.content = msg;
      stream.error = true;
      stream.configAction = err.action;
    } else {
      this.toastr.error(msg);
      stream.content = `Fehler: ${msg}`;
      stream.error = true;
    }
  }

  async executeProposal(msg: ChatMessage, proposal: Proposal) {
    if (this.executing) return;
    this.executing = true;
    try {
      const res = await firstValueFrom(
        this.http.post<{ ok: boolean; navigateTo?: string; number?: string }>(
          '/api/llm/execute',
          { proposal },
        ),
      );
      msg.proposalsExecuted = true;
      const label = proposal.kind === 'invoice'
        ? `Rechnung ${res.number ?? ''} angelegt`
        : proposal.kind === 'time_entry'
          ? 'Zeitbuchung angelegt'
          : proposal.kind === 'expense'
            ? 'Ausgabe angelegt'
            : proposal.kind === 'person'
              ? 'Person angelegt'
              : proposal.kind === 'reminder'
                ? `Mahnung ${res.number ?? ''} angelegt`
                : proposal.kind === 'setting'
                  ? `${(proposal as SettingProposal).label} gesetzt`
                  : 'Firma angelegt';
      this.toastr.success(label);
      if (res.navigateTo) {
        const target = this.resolveNavigationUrl(res.navigateTo, proposal.kind);
        setTimeout(() => this.router.navigateByUrl(target), 1200);
      }
    } catch (e: any) {
      this.toastr.error(e?.error?.error ?? e?.message ?? 'Fehler beim Anlegen');
    } finally {
      this.executing = false;
    }
  }

  dismissProposal(msg: ChatMessage, proposal: Proposal) {
    msg.proposals = (msg.proposals ?? []).filter((p) => p !== proposal);
    if (!msg.proposals.length) msg.proposalsExecuted = true;
  }

  private scrollDown() {
    setTimeout(() => {
      const el = this.msgsEl?.nativeElement;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, 50);
  }

  private resolveNavigationUrl(serverPath: string, kind?: string): string {
    const isMobileContext = this.router.url.startsWith('/m/') || this.router.url === '/m';
    if (isMobileContext) return serverPath;

    const customerMatch = serverPath.match(/^\/m\/customer\/([^/]+)$/);
    if (customerMatch) {
      const id = customerMatch[1];
      return kind === 'company' ? `/crm/company/${id}` : `/crm/person/${id}`;
    }
    const invoiceMatch = serverPath.match(/^\/m\/invoice\/([^/]+)$/);
    if (invoiceMatch) return `/om/invoice/${invoiceMatch[1]}`;
    const projectMatch = serverPath.match(/^\/m\/project\/([^/]+)$/);
    if (projectMatch) return `/pm/project/${projectMatch[1]}`;
    const expenseMatch = serverPath.match(/^\/m\/expense\/([^/]+)\/edit$/);
    if (expenseMatch) return `/expenses/${expenseMatch[1]}/edit`;

    return serverPath;
  }
}
