import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

export type KpiVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
export type KpiDeltaDirection = 'up' | 'down' | 'zero';

/**
 * Reusable KPI-Card. Master-Pattern für alle Stat-Anzeigen in accountant.
 *
 * Eingaben:
 *  - label:    Kurz-Label oben (uppercase, lichtgrau)
 *  - value:    Hauptwert (groß, font-Georgia, tabular-nums)
 *  - subtitle: Optionaler kleiner Text drunter
 *  - variant:  Border-Left + Value-Color-Akzent
 *  - delta:    Vergleichs-Wert mit Direction (zeigt +/− und Farbe)
 *  - routerLink: macht die Card klickbar
 *
 * Designsprache:
 *  - 4px Border-Left in variant-Farbe
 *  - Background light-neutral (#fafafa)
 *  - Value font 1.5rem default, 1.75rem für variant=primary
 *  - Subtitle 0.82rem
 */
@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <ng-container *ngIf="routerLinkValue; else plainCard">
      <a [routerLink]="routerLinkValue" class="kpi-card kpi-link" [ngClass]="'kpi-' + variant">
        <ng-container *ngTemplateOutlet="content"></ng-container>
      </a>
    </ng-container>
    <ng-template #plainCard>
      <div class="kpi-card" [ngClass]="'kpi-' + variant">
        <ng-container *ngTemplateOutlet="content"></ng-container>
      </div>
    </ng-template>

    <ng-template #content>
      <div class="kpi-label">{{ label }}</div>
      <div class="kpi-value" [class.kpi-primary-value]="variant === 'primary'">{{ value }}</div>
      <div *ngIf="subtitle" class="kpi-subtitle">{{ subtitle }}</div>
      <div *ngIf="delta" class="kpi-delta" [ngClass]="'delta-' + (deltaDirection || 'zero')">
        {{ delta }}
      </div>
    </ng-template>
  `,
  styles: [`
    .kpi-card {
      display: block;
      padding: 0.85rem 1rem;
      background: #fff;
      border: 1px solid #ECECEC;
      border-radius: 4px;
      text-decoration: none;
      color: inherit;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .kpi-link {
      cursor: pointer;
      &:hover {
        border-color: #BFBFBF;
        box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      }
    }
    .kpi-label {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 0.82rem;
      font-weight: 500;
      color: #6a6a6a;
      line-height: 1.3;
    }
    .kpi-value {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 1.45rem;
      font-weight: 600;
      color: #111;
      margin-top: 0.4rem;
      line-height: 1.15;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.015em;
      // Preise + lange Beträge brechen sonst hässlich (€-Symbol allein in Zeile 2)
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .kpi-primary-value { font-size: 1.55rem; }
    .kpi-subtitle {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 0.82rem;
      color: #888;
      margin-top: 0.25rem;
    }
    .kpi-delta {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 0.78rem;
      margin-top: 0.35rem;
      color: #888;

      &.delta-up { color: #266100; }
      &.delta-down { color: #8b0000; }
    }

    // Varianten als zarter Akzent oben — kein dicker Streifen
    .kpi-primary .kpi-value { color: #1A1A1A; }
    .kpi-success .kpi-value { color: #266100; }
    .kpi-warning .kpi-value { color: #7d5100; }
    .kpi-danger .kpi-value { color: #8b0000; }
    .kpi-neutral .kpi-value { color: #444; }
    .kpi-default .kpi-value { color: #1A1A1A; }
  `],
})
export class KpiCardComponent {
  @Input() label: string = '';
  @Input() value: string = '';
  @Input() subtitle: string = '';
  @Input() variant: KpiVariant = 'default';
  @Input() delta: string = '';
  @Input() deltaDirection: KpiDeltaDirection | null = null;
  @Input('routerLink') routerLinkValue: any = null;
}
