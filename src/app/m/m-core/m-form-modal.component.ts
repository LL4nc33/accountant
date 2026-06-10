import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ClarityModule } from '@clr/angular';

/**
 * Full-Screen-Modal für Mobile-Quick-Actions (Bezahlt-Markieren, Festschreiben,
 * Storno-Bestätigung, Edit-Position). Schließt mit X oben oder durch [open]=false.
 */
@Component({
  selector: 'm-form-modal',
  standalone: true,
  imports: [CommonModule, ClarityModule],
  template: `
    <div class="m-modal-overlay" [class.open]="open" (click)="close()"></div>
    <div class="m-modal" [class.open]="open" role="dialog">
      <div class="m-modal-head">
        <h2>{{ title }}</h2>
        <button class="m-modal-close" (click)="close()" aria-label="Schließen">
          <cds-icon shape="times" size="20"></cds-icon>
        </button>
      </div>
      <div class="m-modal-body">
        <ng-content></ng-content>
      </div>
      <footer class="m-modal-foot" *ngIf="hasFooter">
        <ng-content select="[modal-foot]"></ng-content>
      </footer>
    </div>
  `,
  styles: [`
    .m-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.4);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.18s ease;
      z-index: 200;

      &.open { opacity: 1; pointer-events: auto; }
    }
    .m-modal {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      max-height: 88vh;
      background: white;
      border-radius: 14px 14px 0 0;
      transform: translateY(100%);
      transition: transform 0.22s ease;
      z-index: 210;
      display: flex;
      flex-direction: column;
      padding-bottom: env(safe-area-inset-bottom);
      overflow: hidden;

      &.open { transform: translateY(0); }
    }
    .m-modal-head {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 1rem 0.75rem;
      border-bottom: 1px solid #E8E8E8;
    }
    .m-modal-head h2 {
      flex: 1;
      margin: 0;
      font-family: Georgia, serif;
      font-size: 1.25rem;
    }
    .m-modal-close {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.5rem;
      color: #666;
      min-width: 44px;
      min-height: 44px;
    }
    .m-modal-body {
      padding: 1rem;
      overflow-y: auto;
    }
    .m-modal-foot {
      padding: 0.75rem 1rem;
      border-top: 1px solid #E8E8E8;
      display: flex;
      gap: 0.6rem;
    }
  `],
})
export class MFormModalComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() hasFooter = true;
  @Output() openChange = new EventEmitter<boolean>();

  close() {
    if (this.open) {
      this.open = false;
      this.openChange.emit(false);
    }
  }
}
