import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { HelpEntry, helpForUrl } from './help-content';

/**
 * Globaler Help-Drawer (rechtes Panel).
 * Ein „?"-Trigger schwebt rechts; Klick fährt ein Overlay-Panel von rechts
 * ein, das seitenspezifische Kurzhilfe zeigt (aus help-content.ts).
 * Desktop-only — auf Mobile/Login wird die Komponente nicht eingehängt.
 */
@Component({
  selector: 'app-help-drawer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button class="help-trigger" [class.hidden]="open" (click)="toggle()" title="Hilfe zu dieser Seite" aria-label="Hilfe">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.1 9a3 3 0 1 1 5.8 1c-.4 1.3-2 2-2.9 2.6"/>
        <line x1="12" y1="17" x2="12" y2="17"/>
      </svg>
    </button>

    <div class="help-backdrop" *ngIf="open" (click)="close()"></div>

    <aside class="help-drawer" [class.open]="open" role="dialog" aria-label="Seitenhilfe">
      <header class="help-head">
        <span class="help-eyebrow">Hilfe</span>
        <button class="help-close" (click)="close()" aria-label="Schließen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </header>

      <div class="help-body" *ngIf="entry">
        <h2>{{ entry.title }}</h2>
        <p class="help-intro" *ngIf="entry.intro">{{ entry.intro }}</p>

        <section class="help-section" *ngFor="let s of entry.sections">
          <h3>{{ s.heading }}</h3>
          <p>{{ s.body }}</p>
        </section>

        <div class="help-tips" *ngIf="entry.tips?.length">
          <div class="help-tip" *ngFor="let t of entry.tips">
            <span class="help-tip-icon">💡</span>
            <span>{{ t }}</span>
          </div>
        </div>
      </div>
    </aside>
  `,
  styles: [`
    :host { display: contents; }

    .help-trigger {
      position: fixed;
      bottom: 5.5rem;
      right: 1.65rem;
      z-index: 880;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      border: 1px solid #DDD;
      background: white;
      color: #555;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);
      transition: color 0.15s, border-color 0.15s, transform 0.1s, opacity 0.15s;
      &:hover { color: #1A1A1A; border-color: #1A1A1A; transform: translateY(-1px); }
      &:active { transform: scale(0.94); }
      &.hidden { opacity: 0; pointer-events: none; }
    }

    .help-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.18);
      z-index: 890;
      animation: fade 0.15s ease;
    }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }

    .help-drawer {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 340px;
      max-width: 90vw;
      background: white;
      border-left: 1px solid #E5E5E5;
      box-shadow: -4px 0 24px rgba(0,0,0,0.08);
      z-index: 900;
      transform: translateX(100%);
      transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      flex-direction: column;
      font-family: system-ui, -apple-system, sans-serif;
      &.open { transform: translateX(0); }
    }
    .help-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.85rem 1rem 0.7rem 1.25rem;
      border-bottom: 1px solid #F0F0F0;
    }
    .help-eyebrow {
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #999;
    }
    .help-close {
      background: transparent;
      border: none;
      color: #888;
      cursor: pointer;
      padding: 0.25rem;
      border-radius: 5px;
      display: flex;
      &:hover { color: #1A1A1A; background: #F4F4F4; }
    }
    .help-body {
      padding: 1.1rem 1.25rem 2rem;
      overflow-y: auto;

      h2 {
        margin: 0 0 0.5rem;
        font-size: 1.15rem;
        font-weight: 600;
        color: #1A1A1A;
      }
      .help-intro {
        margin: 0 0 1.25rem;
        font-size: 0.9rem;
        line-height: 1.55;
        color: #666;
      }
    }
    .help-section {
      margin-bottom: 1.1rem;
      h3 {
        margin: 0 0 0.3rem;
        font-size: 0.88rem;
        font-weight: 600;
        color: #1A1A1A;
      }
      p {
        margin: 0;
        font-size: 0.86rem;
        line-height: 1.55;
        color: #555;
      }
    }
    .help-tips {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid #F0F0F0;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }
    .help-tip {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
      font-size: 0.84rem;
      line-height: 1.5;
      color: #555;
      background: #FAFAFA;
      border-radius: 4px;
      padding: 0.6rem 0.75rem;
    }
    .help-tip-icon { flex-shrink: 0; }
  `],
})
export class HelpDrawerComponent implements OnInit, OnDestroy {
  open = false;
  entry: HelpEntry | null = null;
  private sub?: Subscription;

  constructor(private router: Router) {}

  ngOnInit() {
    this.entry = helpForUrl(this.router.url);
    this.sub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.entry = helpForUrl(e.urlAfterRedirects);
      });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  toggle() { this.open = !this.open; }
  close() { this.open = false; }

  @HostListener('document:keydown.escape')
  onEsc() { if (this.open) this.close(); }
}
