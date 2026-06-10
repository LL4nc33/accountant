import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MTopbarComponent } from './m-topbar.component';
import { MDrawerComponent } from './m-drawer.component';

/**
 * Top-Level-Wrapper für alle /m/*-Routes.
 * Rendert Topbar + Drawer + Content-Area.
 */
@Component({
  selector: 'm-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, MTopbarComponent, MDrawerComponent],
  template: `
    <m-topbar (toggleDrawer)="drawerOpen = !drawerOpen"></m-topbar>
    <m-drawer [(open)]="drawerOpen"></m-drawer>
    <main class="m-page-container">
      <router-outlet></router-outlet>
    </main>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
    }
    .m-page-container {
      padding-top: calc(var(--m-topbar-h, 56px) + env(safe-area-inset-top));
      padding-bottom: env(safe-area-inset-bottom);
      padding-left: var(--m-page-padding, 1rem);
      padding-right: var(--m-page-padding, 1rem);
      min-height: 100vh;
      box-sizing: border-box;
    }
  `],
})
export class MShellComponent {
  drawerOpen = false;
}
