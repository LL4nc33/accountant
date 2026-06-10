import { CommonModule } from '@angular/common';
import { Component, ContentChildren, Directive, EventEmitter, Input, Output, QueryList, TemplateRef, AfterContentInit } from '@angular/core';
import { ClarityModule } from '@clr/angular';

/**
 * Section-Definition für die Mobile-Edit-Shell.
 * Mobile nutzt ein Accordion-Pattern (alle Sektionen sichtbar, einzeln aufklappbar).
 *
 * WICHTIG: Das `<form>`-Element MUSS innerhalb jedes `<ng-template mEditSection>`
 * stehen, nicht außenherum. Templates werden via `*ngTemplateOutlet` gerendert —
 * ein außenliegendes `<form>` taucht nie im DOM auf, `(ngSubmit)` feuert nicht,
 * und ngModel fällt in den Standalone-Modus zurück. (Gleiche Regel wie app-edit-shell.)
 *
 * <m-edit-shell title="Firma">
 *   <ng-template mEditSection="Stammdaten" [defaultOpen]="true">
 *     <form (ngSubmit)="save()">
 *       <label class="m-field">...</label>
 *       <button type="submit">Speichern</button>
 *     </form>
 *   </ng-template>
 *   <ng-template mEditSection="SMTP">
 *     <form (ngSubmit)="save()">...</form>
 *   </ng-template>
 * </m-edit-shell>
 */
@Directive({
  selector: '[mEditSection]',
  standalone: true,
})
export class MEditSectionDirective {
  @Input('mEditSection') label = '';
  /** Sektion default geöffnet? Sinnvoll für die erste/wichtigste. */
  @Input() defaultOpen = false;
  /** Validierungs-Hinweis (roter Dot im Header) */
  @Input() invalid = false;
  /** Sektion ganz ausblenden (für conditional rendering) */
  @Input() editSectionSkip = false;

  constructor(public templateRef: TemplateRef<unknown>) {}
}

@Component({
  selector: 'm-edit-shell',
  standalone: true,
  imports: [CommonModule, ClarityModule],
  template: `
    <div class="m-edit-shell">
      <div class="m-edit-head">
        <div class="m-edit-head-text">
          <h2>{{ title }}</h2>
          <p *ngIf="subtitle" class="m-edit-subtitle">{{ subtitle }}</p>
        </div>
        <div class="m-edit-head-actions">
          <ng-content select="[mHeadActions]"></ng-content>
          <button *ngIf="showSave" type="button" class="btn btn-primary btn-sm" (click)="save.emit()" [disabled]="saving">
            {{ saving ? '…' : 'Speichern' }}
          </button>
        </div>
      </div>

      <div *ngFor="let section of visibleSections; let i = index" class="m-edit-section">
        <button class="m-edit-section-head"
                [class.expanded]="openIndex === i"
                (click)="toggle(i)"
                type="button">
          <span class="m-edit-section-label">
            {{ section.label }}
            <span *ngIf="section.invalid" class="m-edit-invalid-dot" title="Pflichtfeld leer"></span>
          </span>
          <cds-icon shape="angle" [attr.direction]="openIndex === i ? 'up' : 'down'" size="14"></cds-icon>
        </button>
        <div *ngIf="openIndex === i" class="m-edit-section-body">
          <ng-container *ngTemplateOutlet="section.templateRef"></ng-container>
        </div>
      </div>

      <div class="m-edit-actions" *ngIf="showFooter">
        <ng-content select="[mFootActions]"></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .m-edit-shell { padding-bottom: 2rem; }
    .m-edit-head {
      margin-bottom: 1rem;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.75rem;
      flex-wrap: wrap;

      .m-edit-head-text { flex: 1 1 auto; min-width: 0; }
      h2 { margin: 0 0 0.2rem; font-size: 1.15rem; font-weight: 600; color: #1a1a1a; }
      .m-edit-subtitle { margin: 0; font-size: 0.85rem; color: #666; }
      .m-edit-head-actions {
        display: flex;
        gap: 0.4rem;
        align-items: center;
        flex-wrap: wrap;
        flex-shrink: 0;
      }
    }
    .m-edit-section {
      border-bottom: 1px solid #E8E8E8;
      background: white;
    }
    .m-edit-section-head {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.9rem 0;
      background: none;
      border: none;
      font-family: inherit;
      font-size: 1rem;
      font-weight: 500;
      color: #1a1a1a;
      text-align: left;
      cursor: pointer;
      min-height: 48px;

      &.expanded { color: #000; font-weight: 600; }
    }
    .m-edit-section-label {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }
    .m-edit-invalid-dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #c92100;
    }
    .m-edit-section-body {
      padding: 0.5rem 0 1.25rem;
    }
    .m-edit-actions {
      position: sticky;
      bottom: 0;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(8px);
      padding: 0.75rem 0;
      padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
      border-top: 1px solid #E8E8E8;
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
    }
  `],
})
export class MEditShellComponent implements AfterContentInit {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() showFooter = false;
  /** Speichern-Button oben rechts ein/aus. (save) feuert beim Click. */
  @Input() showSave = false;
  /** Loading-State für den Speichern-Button. */
  @Input() saving = false;
  @Output() save = new EventEmitter<void>();

  @ContentChildren(MEditSectionDirective) sectionsQuery!: QueryList<MEditSectionDirective>;
  visibleSections: MEditSectionDirective[] = [];
  openIndex = 0;

  ngAfterContentInit() {
    const update = () => {
      this.visibleSections = this.sectionsQuery.filter(s => !s.editSectionSkip);
      // Erste mit defaultOpen aufklappen, sonst Index 0
      const defaultIdx = this.visibleSections.findIndex(s => s.defaultOpen);
      this.openIndex = defaultIdx >= 0 ? defaultIdx : 0;
    };
    update();
    this.sectionsQuery.changes.subscribe(update);
  }

  toggle(i: number) {
    this.openIndex = this.openIndex === i ? -1 : i;
  }
}
