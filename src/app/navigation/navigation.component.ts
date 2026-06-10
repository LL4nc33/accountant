import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  ClrIconModule,
  ClrNavigationModule,
  ClrVerticalNavModule,
} from '@clr/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { remult } from 'remult';
import { featureFlags } from '../feature-flags';
import { ModulesService } from '../core/modules.service';
import { AuthService } from '../auth/auth.service';
import { MobileDetectService } from '../core/mobile-detect.service';
import { HelpDrawerComponent } from '../core/help-drawer/help-drawer.component';
import { ChatWidgetComponent } from '../core/chat-widget/chat-widget.component';

@Component({
    selector: 'app-navigation',
    imports: [
        CommonModule,
        ClrNavigationModule,
        ClrIconModule,
        RouterLink,
        RouterLinkActive,
        ClrVerticalNavModule,
        RouterOutlet,
        TranslateModule,
        HelpDrawerComponent,
        ChatWidgetComponent
    ],
    templateUrl: './navigation.component.html',
    styleUrl: './navigation.component.scss'
})
export class NavigationComponent {
  demoCollapsible = false;
  featureFlags = featureFlags;

  constructor(
    public modules: ModulesService,
    private translate: TranslateService,
    private authService: AuthService,
    private router: Router,
    private mobileDetect: MobileDetectService,
  ) {}

  switchToMobile() {
    this.mobileDetect.setForceMobile(true);
    const target = this.mobileDetect.desktopToMobile(this.router.url);
    this.router.navigateByUrl(target);
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
}
