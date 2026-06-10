import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

/**
 * Sektion-Header für lange Mobile-Forms. Ersetzt das Tabs-Pattern vom Desktop
 * durch sequentielle Sections.
 *
 *   <m-form-section title="Stammdaten" subtitle="optional">
 *     ...inputs...
 *   </m-form-section>
 */
@Component({
  selector: 'm-form-section',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="m-form-section">
      <div class="m-form-section-head">
        <h3>{{ title }}</h3>
        <p *ngIf="subtitle" class="m-form-section-sub">{{ subtitle }}</p>
      </div>
      <div class="m-form-section-body">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .m-form-section {
      margin-bottom: 2rem;
    }
    .m-form-section-head {
      padding-bottom: 0.5rem;
      margin-bottom: 1rem;
      border-bottom: 1px solid #E8E8E8;
    }
    .m-form-section-head h3 {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 1.2rem;
      margin: 0;
    }
    .m-form-section-sub {
      font-size: 0.85rem;
      color: #666;
      margin: 0.25rem 0 0;
    }
    .m-form-section-body {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
  `],
})
export class MFormSectionComponent {
  @Input() title = '';
  @Input() subtitle = '';
}
