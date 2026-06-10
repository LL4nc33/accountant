import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { markdownToHtml } from '../core/markdown.util';

interface Chapter { file: string; title: string; }

/**
 * Anwender-Handbuch — lädt die Kapitel LIVE aus dem öffentlichen GitHub-Repo
 * (raw), damit es immer dem aktuellen Stand entspricht, ohne dass das Handbuch
 * in jedem Release mitgebaut werden muss. Markdown-Rendering via dem geteilten
 * core/markdown.util (gleicher Renderer wie der KI-Chat).
 */
@Component({
  selector: 'app-handbuch',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="hb-page">
      <aside class="hb-nav">
        <div class="hb-nav-title">Handbuch</div>
        <ul>
          <li *ngFor="let c of chapters" [class.active]="c.file === active?.file">
            <button (click)="open(c)">{{ c.title }}</button>
          </li>
        </ul>
        <a class="hb-gh" [href]="repoUrl" target="_blank" rel="noopener">Auf GitHub ansehen ↗</a>
      </aside>

      <main class="hb-content">
        <div *ngIf="loading" class="hb-state">Lädt …</div>
        <div *ngIf="error && !loading" class="hb-state hb-error">
          Kapitel konnte nicht geladen werden (offline?).
          <a [href]="rawUrl(active?.file)" target="_blank" rel="noopener">Direkt auf GitHub öffnen ↗</a>
        </div>
        <article *ngIf="!loading && !error" class="hb-md" (click)="onClick($event)" [innerHTML]="html"></article>
      </main>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .hb-page { display: grid; grid-template-columns: 260px 1fr; gap: 0; min-height: calc(100dvh - 4rem); }
    @media (max-width: 820px) { .hb-page { grid-template-columns: 1fr; } .hb-nav { display: none; } }

    .hb-nav {
      border-right: 1px solid #E8E8E8; background: #FAFAFA; padding: 1rem 0.75rem;
      font-family: system-ui, -apple-system, sans-serif; align-self: start; position: sticky; top: 0;
      max-height: calc(100dvh - 4rem); overflow-y: auto;
    }
    .hb-nav-title { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #999; padding: 0 0.5rem; margin-bottom: 0.6rem; }
    .hb-nav ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.05rem; }
    .hb-nav li button {
      width: 100%; text-align: left; background: transparent; border: none; cursor: pointer;
      font-family: inherit; font-size: 0.86rem; color: #444; padding: 0.4rem 0.5rem; border-radius: 4px;
    }
    .hb-nav li button:hover { background: #F0F0F0; color: #1A1A1A; }
    .hb-nav li.active button { background: #1A1A1A; color: #fff; font-weight: 500; }
    .hb-gh { display: inline-block; margin: 0.85rem 0.5rem 0; font-size: 0.8rem; color: #666; text-decoration: none; }
    .hb-gh:hover { color: #1A1A1A; text-decoration: underline; }

    .hb-content { padding: 1.5rem 2.25rem; max-width: 860px; }
    .hb-state { color: #888; font-family: system-ui, sans-serif; padding: 2rem 0; }
    .hb-error a, .hb-error { color: #5D2E2E; }

    .hb-md { font-family: Georgia, 'Times New Roman', serif; color: #1A1A1A; line-height: 1.7; font-size: 1rem; }
    .hb-md ::ng-deep h2 { font-size: 1.5rem; font-weight: 600; margin: 0 0 1rem; padding-bottom: 0.4rem; border-bottom: 1px solid #E8E8E8; }
    .hb-md ::ng-deep h3 { font-size: 1.18rem; font-weight: 600; margin: 1.6rem 0 0.5rem; }
    .hb-md ::ng-deep h4 { font-size: 1.02rem; font-weight: 600; margin: 1.2rem 0 0.4rem; }
    .hb-md ::ng-deep p { margin: 0 0 0.85rem; }
    .hb-md ::ng-deep ul, .hb-md ::ng-deep ol { margin: 0.4rem 0 0.95rem; padding-left: 1.4rem; }
    .hb-md ::ng-deep li { margin: 0.25rem 0; }
    .hb-md ::ng-deep strong { font-weight: 700; }
    .hb-md ::ng-deep code { font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 0.85em; background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 4px; }
    .hb-md ::ng-deep pre { background: #F7F7F7; border: 1px solid #ECECEC; padding: 0.8rem 1rem; border-radius: 4px; overflow-x: auto; margin: 0.6rem 0; }
    .hb-md ::ng-deep pre code { background: none; padding: 0; }
    .hb-md ::ng-deep a { color: #1A1A1A; text-decoration: underline; text-underline-offset: 2px; text-decoration-color: #BBB; cursor: pointer; }
    .hb-md ::ng-deep a:hover { text-decoration-color: #1A1A1A; }
    .hb-md ::ng-deep table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 0.9rem 0; font-size: 0.9rem; border: 1px solid #E0E0E0; border-radius: 4px; overflow: hidden; font-family: system-ui, sans-serif; }
    .hb-md ::ng-deep th, .hb-md ::ng-deep td { padding: 0.5rem 0.7rem; text-align: left; border-bottom: 1px solid #ECECEC; border-right: 1px solid #ECECEC; }
    .hb-md ::ng-deep th:last-child, .hb-md ::ng-deep td:last-child { border-right: none; }
    .hb-md ::ng-deep tbody tr:last-child td { border-bottom: none; }
    .hb-md ::ng-deep thead th { background: #F6F6F6; font-weight: 600; }
    .hb-md ::ng-deep tbody tr:nth-child(even) { background: #FAFAFA; }
    .hb-md ::ng-deep img { max-width: 100%; height: auto; border: 1px solid #E8E8E8; border-radius: 6px; margin: 0.9rem 0; display: block; }
  `],
})
export class HandbuchComponent implements OnInit {
  // Quelle: das öffentliche accountant-Repo. Anpassen falls geforkt.
  private readonly owner = 'LL4nc33';
  private readonly repo = 'accountant';
  private readonly branch = 'main';
  readonly repoUrl = `https://github.com/${this.owner}/${this.repo}/tree/${this.branch}/docs/manual`;

  chapters: Chapter[] = [
    { file: '00-uebersicht.md', title: 'Übersicht' },
    { file: '01-installation.md', title: 'Installation' },
    { file: '02-erste-schritte.md', title: 'Erste Schritte' },
    { file: '03-firmen-einstellungen.md', title: 'Firmen-Einstellungen' },
    { file: '04-uid-und-vies.md', title: 'UID & VIES' },
    { file: '05-reverse-charge.md', title: 'Reverse-Charge' },
    { file: '06-kleinunternehmer.md', title: 'Kleinunternehmer' },
    { file: '07-leistungsdatum-und-pflichtangaben.md', title: 'Leistungsdatum & Pflichtangaben' },
    { file: '08-projekte-und-zeiterfassung.md', title: 'Projekte & Zeiterfassung' },
    { file: '09-module.md', title: 'Module' },
    { file: '10-mobile-app.md', title: 'Mobile-App' },
    { file: '11-ki-assistent.md', title: 'KI-Assistent' },
    { file: '12-mahnwesen.md', title: 'Mahnwesen' },
    { file: '13-uva.md', title: 'USt-Voranmeldung' },
    { file: '14-bmd-export.md', title: 'BMD-Export' },
    { file: '15-backup.md', title: 'Backup' },
    { file: '16-bank-abgleich.md', title: 'Bank-Abgleich' },
    { file: '17-angebote.md', title: 'Angebote' },
    { file: '18-conversation-memory.md', title: 'Conversation-Memory' },
    { file: '19-clv-tags.md', title: 'CLV & Tags' },
    { file: '20-analytics.md', title: 'Analytics' },
    { file: '21-plan-then-act.md', title: 'Plan-then-Act' },
    { file: '22-activity-timeline.md', title: 'Activity-Timeline' },
    { file: '23-custom-fields.md', title: 'Custom Fields' },
    { file: '24-paperless.md', title: 'Paperless-ngx' },
    { file: '25-beleg-ocr.md', title: 'Beleg-OCR' },
    { file: '26-xrechnung.md', title: 'XRechnung' },
    { file: '27-multi-currency.md', title: 'Multi-Currency' },
    { file: '28-svs-vorschau.md', title: 'SVS-Vorschau' },
    { file: '29-est-vorschau.md', title: 'ESt-Vorschau' },
    { file: '30-skonto.md', title: 'Skonto' },
    { file: '31-logo-rechnungslayout.md', title: 'Logo & Rechnungslayout' },
    { file: '32-zm.md', title: 'Zusammenfassende Meldung' },
    { file: '33-afa-anlagen.md', title: 'AfA & Anlagen' },
    { file: '34-auftragsbestaetigung-lieferschein.md', title: 'Auftragsbestätigung & Lieferschein' },
    { file: '35-reisekosten.md', title: 'Reisekosten' },
    { file: '36-kassabuch.md', title: 'Kassabuch' },
    { file: '37-navigation-layout.md', title: 'Navigation & Layout' },
  ];

  active: Chapter | null = null;
  html: SafeHtml = '';
  loading = false;
  error = false;

  constructor(private http: HttpClient, private sanitizer: DomSanitizer, private router: Router) {}

  ngOnInit() { this.open(this.chapters[0]); }

  rawUrl(file?: string) {
    return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/docs/manual/${file ?? ''}`;
  }

  async open(c: Chapter) {
    this.active = c;
    this.loading = true;
    this.error = false;
    try {
      const md = await firstValueFrom(this.http.get(this.rawUrl(c.file), { responseType: 'text' }));
      this.html = this.sanitizer.bypassSecurityTrustHtml(markdownToHtml(md));
    } catch {
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  // Interne Markdown-Links (/…) per Router öffnen statt Full-Reload.
  onClick(ev: MouseEvent) {
    const a = (ev.target as HTMLElement)?.closest('a.md-link-internal') as HTMLAnchorElement | null;
    if (!a) return;
    ev.preventDefault();
    const href = a.getAttribute('href') || '';
    if (href.startsWith('/')) this.router.navigateByUrl(href);
  }
}
