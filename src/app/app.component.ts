import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { ClarityModule } from "@clr/angular";
import { filter } from 'rxjs';
import { AuthService } from './auth/auth.service';
import { NavigationComponent } from './navigation/navigation.component';
import { MobileDetectService } from './core/mobile-detect.service';
import { TranslateModule } from '@ngx-translate/core';
import {} from '@angular/common/http';

@Component({
    selector: 'app-root',
    imports: [CommonModule, RouterOutlet, RouterLink, ClarityModule, NavigationComponent, TranslateModule],
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'accountant';
  showDefaultPwBanner = false;
  isLoginRoute = false;
  isMobileRoute = false;

  constructor(
    @Inject(AuthService) public authService: AuthService,
    private router: Router,
    private mobileDetect: MobileDetectService,
  ) {
    this.authService.user.subscribe((u: any) => {
      this.showDefaultPwBanner = !!(u && u.usedDefaultPassword);
      this.enforcePwChange();
    });
    this.isLoginRoute = this.router.url.startsWith('/login');
    this.isMobileRoute = this.router.url.startsWith('/m') && !this.router.url.startsWith('/me');
    // Zweiter Wächter: bei jeder Navigation prüfen, ob der User noch das Default-PW hat —
    // fängt deep-links bei persistenter Session und alle Versuche, die /change-password-Seite
    // zu verlassen.
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        this.isLoginRoute = this.router.url.startsWith('/login');
        this.isMobileRoute = this.router.url.startsWith('/m') && !this.router.url.startsWith('/me');
        this.enforcePwChange();
        this.enforceViewSeparation();
      });
  }

  private enforcePwChange(): void {
    if (!this.showDefaultPwBanner) return;
    if (this.router.url.startsWith('/change-password')) return;
    if (this.router.url.startsWith('/login')) return;
    // Self-Hosted-Apps mit admin/admin sind ein direkter Art-32-DSGVO-Verstoß —
    // also blockieren wir alle anderen Seiten bis ein eigenes Passwort gesetzt ist.
    this.router.navigateByUrl('/change-password');
  }

  /**
   * Strikte View-Trennung: User soll nie aus Versehen aus Desktop in
   * Mobile-View (oder umgekehrt) landen — z.B. via Sharing-Link, Bookmark
   * oder Server-Response mit /m/*-Pfad.
   *
   * Verhalten:
   *   - shouldUseMobile() = true  → Desktop-URL → /m/*-Variante
   *   - shouldUseMobile() = false → /m/*-URL → Desktop-Variante
   *
   * Die Cookies `oa-force-mobile` / `oa-force-desktop` (vom User-Menu
   * setzbar) übersteuern die Viewport-Heuristik.
   */
  private enforceViewSeparation(): void {
    const url = this.router.url;
    if (url.startsWith('/login')) return;
    if (url.startsWith('/change-password')) return;

    const isMobileUrl = url.startsWith('/m/') || url === '/m';
    const wantsMobile = this.mobileDetect.shouldUseMobile();

    if (wantsMobile && !isMobileUrl) {
      const target = this.mobileDetect.desktopToMobile(url);
      if (target !== url) this.router.navigateByUrl(target);
      return;
    }

    if (!wantsMobile && isMobileUrl) {
      const target = this.mobileDetect.mobileToDesktop(url);
      if (target !== url) this.router.navigateByUrl(target);
    }
  }
}
