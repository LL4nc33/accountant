import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { filter } from 'rxjs';

/**
 * Sticky-Top-Bar für die Mobile-UI. 56px hoch, schwarz, dreigeteilt:
 * links Hamburger, mitte Titel, rechts kontextuelle Action.
 *
 * Titel kommt aus dem aktiven Route-Data (data.title).
 */
@Component({
  selector: 'm-topbar',
  standalone: true,
  imports: [CommonModule, ClarityModule, RouterLink],
  template: `
    <div class="m-topbar" role="banner">
      <button class="m-topbar-btn" (click)="toggleDrawer.emit()" aria-label="Menü öffnen">
        <cds-icon shape="bars" size="24"></cds-icon>
      </button>
      <a routerLink="/m" class="m-topbar-title">{{ title || 'accountant' }}</a>
      <div class="m-topbar-action">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .m-topbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: var(--m-topbar-h, 56px);
      padding-top: env(safe-area-inset-top);
      display: flex;
      align-items: center;
      background: var(--m-topbar-bg, #1A1A1A);
      color: var(--m-topbar-fg, white);
      z-index: 100;
      box-shadow: 0 1px 2px rgba(0,0,0,0.15);
    }
    .m-topbar-btn {
      width: 56px;
      height: 56px;
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      &:active { background: rgba(255,255,255,0.1); }
    }
    .m-topbar-title {
      flex: 1;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 1.1rem;
      font-weight: 600;
      color: inherit;
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding-right: 1rem;
    }
    .m-topbar-action {
      min-width: 56px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 0.5rem;
    }
  `],
})
export class MTopbarComponent {
  @Output() toggleDrawer = new EventEmitter<void>();
  title = '';

  constructor(private router: Router, private route: ActivatedRoute) {
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.title = this.deepestTitle(this.route));
  }

  private deepestTitle(route: ActivatedRoute): string {
    let r = route;
    while (r.firstChild) r = r.firstChild;
    return r.snapshot.data?.['title'] ?? '';
  }
}
