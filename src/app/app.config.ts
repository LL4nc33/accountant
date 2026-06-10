import { APP_INITIALIZER, ApplicationConfig, importProvidersFrom, LOCALE_ID, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { provideAnimations } from '@angular/platform-browser/animations';
import { AuthService } from './auth/auth.service';
import { provideHttpClient, HttpClient } from '@angular/common/http';
import { provideToastr } from 'ngx-toastr';
import { TranslateModule, TranslateLoader, TranslateService } from '@ngx-translate/core';
import { HttpLoaderFactory } from './app.translate-loader';
import { ModulesService } from './core/modules.service';
import { registerLocaleData } from '@angular/common';
import localeDeAt from '@angular/common/locales/de-AT';
import localeDeAtExtra from '@angular/common/locales/extra/de-AT';
registerLocaleData(localeDeAt, 'de-AT', localeDeAtExtra);

export function initializeTranslations(translate: TranslateService) {
  return () => {
    // accountant is hard DE-primary. Browser-Locale wird IGNORIERT — User kann
    // im Header-Dropdown manuell auf EN umschalten, default ist DE.
    translate.setDefaultLang('de');
    translate.use('de');
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'de-AT' },
    provideHttpClient(),
    {
      provide: APP_INITIALIZER,
      useFactory: (authService: AuthService) => (authService.checkUser()),
      deps: [AuthService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeTranslations,
      deps: [TranslateService],
      multi: true,
    },
    {
      // Module-Flags laden bevor irgendeine Component (insb. Navigation)
      // rendert. Schlägt der Call fehl (unauth, offline), greifen Defaults
      // im ModulesService — kein blockierender Fehler.
      provide: APP_INITIALIZER,
      useFactory: (modules: ModulesService) => () => modules.load(),
      deps: [ModulesService],
      multi: true,
    },
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideAnimations(),
    provideToastr({
      positionClass: 'toast-bottom-right',
      timeOut: 3500,
      closeButton: true,
      preventDuplicates: true,
      progressBar: false,
    }),
    importProvidersFrom(
      TranslateModule.forRoot({
        loader: {
          provide: TranslateLoader,
          useFactory: HttpLoaderFactory,
          deps: [HttpClient]
        }
      })
    )
  ],
};
