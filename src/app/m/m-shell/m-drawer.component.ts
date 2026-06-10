import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { TranslateService } from '@ngx-translate/core';
import { filter, Subscription } from 'rxjs';
import { remult } from 'remult';
import { AuthService } from '../../auth/auth.service';
import { ModulesService } from '../../core/modules.service';
import { MobileDetectService } from '../../core/mobile-detect.service';

/**
 * Slide-in-Drawer von links. Schließt automatisch bei Navigation.
 * Branding oben, Main-Nav mittig, Settings + User + Logout unten.
 */
@Component({
  selector: 'm-drawer',
  standalone: true,
  imports: [CommonModule, ClarityModule, RouterLink, RouterLinkActive],
  templateUrl: './m-drawer.component.html',
  styleUrl: './m-drawer.component.scss',
})
export class MDrawerComponent implements OnInit, OnDestroy {
  @Input() open = false;
  @Output() openChange = new EventEmitter<boolean>();

  expandedGroup: string | null = null;
  private routerSub?: Subscription;

  constructor(
    public modules: ModulesService,
    private translate: TranslateService,
    private authService: AuthService,
    private router: Router,
    private mobileDetect: MobileDetectService,
  ) {}

  ngOnInit() {
    this.routerSub = this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.close());
  }

  ngOnDestroy() {
    this.routerSub?.unsubscribe();
  }

  close() {
    if (this.open) {
      this.open = false;
      this.openChange.emit(false);
    }
  }

  toggleGroup(name: string) {
    this.expandedGroup = this.expandedGroup === name ? null : name;
  }

  get userName(): string {
    return (remult.user?.name ?? '').trim();
  }

  get isAdmin(): boolean {
    return remult.user?.roles?.includes('admin') ?? false;
  }

  get currentLang(): string {
    return this.translate.currentLang || this.translate.defaultLang || 'de';
  }

  setLang(lang: 'de' | 'en') {
    this.translate.use(lang);
  }

  logout(ev: Event) {
    ev.preventDefault();
    this.authService.logOut();
    this.router.navigate(['/login']);
  }

  forceDesktop() {
    // setForceDesktop räumt zugleich force-mobile weg
    this.mobileDetect.setForceDesktop(true);
    window.location.href = '/';
  }
}
