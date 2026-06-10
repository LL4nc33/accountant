import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Wieder­verwendbare Card für Mobile-Listen. Tappable, mit optionalem
 * RouterLink. Drei ng-content-Slots: card-head, card-body, card-status.
 *
 * Beispiel:
 *   <m-card [link]="['/m/invoice', inv.id]">
 *     <div card-head>{{ inv.number }} · {{ customer }}</div>
 *     <div card-body>{{ date }} · {{ amount }}</div>
 *     <div card-status>
 *       <span class="m-badge">…</span>
 *     </div>
 *   </m-card>
 */
@Component({
  selector: 'm-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <a *ngIf="link; else divTpl" [routerLink]="link" class="m-card">
      <div class="m-card-head"><ng-content select="[card-head]"></ng-content></div>
      <div class="m-card-body"><ng-content select="[card-body]"></ng-content></div>
      <div class="m-card-status"><ng-content select="[card-status]"></ng-content></div>
    </a>
    <ng-template #divTpl>
      <div class="m-card">
        <div class="m-card-head"><ng-content select="[card-head]"></ng-content></div>
        <div class="m-card-body"><ng-content select="[card-body]"></ng-content></div>
        <div class="m-card-status"><ng-content select="[card-status]"></ng-content></div>
      </div>
    </ng-template>
  `,
  styles: [`
    .m-card {
      display: block;
      background: white;
      border: 1px solid #E8E8E8;
      border-radius: 6px;
      padding: 0.9rem 1rem;
      margin-bottom: 0.6rem;
      color: #1A1A1A;
      text-decoration: none;
      min-height: 72px;
      cursor: pointer;

      &:active { background: #FAFAFA; }
    }
    .m-card-head {
      font-weight: 600;
      margin-bottom: 0.25rem;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.5rem;
    }
    .m-card-body {
      font-size: 0.92rem;
      color: #555;
      margin-bottom: 0.4rem;
    }
    .m-card-status {
      display: flex;
      gap: 0.3rem;
      flex-wrap: wrap;
    }
    .m-card-status:empty { display: none; }
  `],
})
export class MCardComponent {
  @Input() link: string | string[] | null = null;
}
