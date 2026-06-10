import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClarityModule } from '@clr/angular';

@Component({
  selector: 'app-empty-state',
  imports: [CommonModule, ClarityModule, RouterLink],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
})
export class EmptyStateComponent {
  @Input() icon = 'info-circle';      // CDS icon shape, default info
  @Input() title = '';
  @Input() text = '';
  @Input() ctaLabel = '';
  @Input() ctaRouterLink: any[] | null = null;
  @Output() ctaClick = new EventEmitter<void>();
}
