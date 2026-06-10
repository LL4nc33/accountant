import { CommonModule } from '@angular/common';
import { Component, ContentChildren, Directive, ElementRef, EventEmitter, Input, Output, QueryList, TemplateRef, AfterContentInit, AfterViewInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ClarityModule } from '@clr/angular';

/**
 * Tab-Definition für die Edit-Shell. Eine Section pro Tab.
 * Markiere ein Template mit `*editTab="'Bezeichnung'"` und es wird ein Tab.
 *
 * WICHTIG: Das `<form>`-Element MUSS innerhalb jedes `<ng-template editTab>` stehen,
 * nicht außenherum. Templates werden via `*ngTemplateOutlet` in der Edit-Shell
 * gerendert — ein außenliegendes `<form>` taucht nie im DOM auf, `(ngSubmit)`
 * feuert nicht, und ngModel fällt in den Standalone-Modus zurück.
 *
 * Speichern oben rechts: setze `[showSave]="true"` plus `[saving]` und (save)-Output.
 * Der globale Save-Button löst (save) aus — alle Forms in den Tabs feuern via
 * (ngSubmit) ebenfalls denselben Handler, damit Enter-Key weiter funktioniert.
 *
 * Beispiel:
 * <app-edit-shell title="Firma" [showSave]="true" [saving]="saving" (save)="save()">
 *   <ng-template editTab="Stammdaten">
 *     <form clrForm (ngSubmit)="save()">
 *       <clr-input-container>...</clr-input-container>
 *     </form>
 *   </ng-template>
 *   <ng-template editTab="Bank" [invalid]="!iban">
 *     <form clrForm (ngSubmit)="save()">...</form>
 *   </ng-template>
 * </app-edit-shell>
 */
@Directive({
  selector: '[editTab]',
  standalone: true,
})
export class EditTabDirective {
  /** Tab-Label */
  @Input('editTab') label = '';
  /** Optional: Tab als invalid markieren (roter Dot im Tab-Label) */
  @Input() invalid = false;
  /** Optional: Tab überspringen (für conditional sections) */
  @Input() editTabSkip = false;

  constructor(public templateRef: TemplateRef<unknown>) {}
}

/**
 * Edit-Shell — einheitliches Layout für alle Edit-/Settings-Pages.
 * Desktop: horizontale Clarity-Tabs mit Validierungs-Dot.
 * Title-Bar oben, persistente Action-Bar (Save/Cancel/Custom) unten.
 *
 * Mobile-Pendant: m-edit-shell (Accordion).
 */
@Component({
  selector: 'app-edit-shell',
  standalone: true,
  imports: [CommonModule, ClarityModule],
  template: `
    <div class="edit-shell">
      <!-- Bewusst <div> statt <header>: Clarity stylet <header>-Tags global
           mit dunklem Background — den wollen wir hier nicht. -->
      <div class="edit-shell-head">
        <div class="head-text">
          <h1>{{ title }}</h1>
          <p *ngIf="subtitle" class="subtitle">{{ subtitle }}</p>
        </div>
        <div class="head-actions">
          <ng-content select="[headActions]"></ng-content>
          <button *ngIf="showSave" type="button" class="btn btn-primary" (click)="save.emit()" [disabled]="saving">
            {{ saving ? 'Speichert…' : 'Speichern' }}
          </button>
        </div>
      </div>

      <clr-tabs class="edit-shell-tabs">
        <clr-tab *ngFor="let tab of visibleTabs">
          <button clrTabLink>
            <span class="tab-label">{{ tab.label }}</span>
            <span *ngIf="tab.invalid" class="tab-invalid-dot" title="Ein Pflichtfeld in diesem Tab ist leer"></span>
          </button>
          <clr-tab-content *clrIfActive>
            <div class="tab-body">
              <ng-container *ngTemplateOutlet="tab.templateRef"></ng-container>
            </div>
          </clr-tab-content>
        </clr-tab>
      </clr-tabs>

      <footer class="edit-shell-actions" *ngIf="showFooter">
        <ng-content select="[footActions]"></ng-content>
      </footer>
    </div>
  `,
  styleUrl: './edit-shell.component.scss',
})
export class EditShellComponent implements AfterContentInit, AfterViewInit {
  @Input() title = '';
  @Input() subtitle = '';
  /** Action-Bar unten ein/aus. Default aus — wer Custom-Actions will, schaltet an. */
  @Input() showFooter = false;
  /** Speichern-Button oben rechts ein/aus. (save) feuert beim Click. */
  @Input() showSave = false;
  /** Loading-State für den Speichern-Button. */
  @Input() saving = false;
  @Output() save = new EventEmitter<void>();

  @ContentChildren(EditTabDirective) tabsQuery!: QueryList<EditTabDirective>;
  visibleTabs: EditTabDirective[] = [];

  constructor(private route: ActivatedRoute, private host: ElementRef<HTMLElement>) {}

  ngAfterContentInit() {
    const update = () => {
      this.visibleTabs = this.tabsQuery.filter(t => !t.editTabSkip);
    };
    update();
    this.tabsQuery.changes.subscribe(update);
  }

  /**
   * Deep-Link: ?tab=<Name> öffnet den passenden Tab. Lenientes Matching
   * (lowercase, nur Buchstaben/Ziffern) damit der Support-Agent z.B.
   * ?tab=steuer für „Steuer & UID" treffen kann. Klickt den Tab-Button
   * programmatisch — robuster als Clarity's active-Binding.
   */
  ngAfterViewInit() {
    const wanted = this.route.snapshot.queryParamMap.get('tab');
    if (!wanted) return;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöü]/g, '');
    const target = norm(wanted);
    setTimeout(() => {
      const labels = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('.tab-label'));
      const hit = labels.find((el) => {
        const t = norm(el.textContent || '');
        return t === target || t.startsWith(target) || target.startsWith(t);
      });
      const btn = hit?.closest('button');
      if (btn) btn.click();
    }, 60);
  }
}
