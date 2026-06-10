import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { TranslateModule } from '@ngx-translate/core';
import { HttpLoaderFactory } from './app/app.translate-loader';
import './icons';
import { provideHttpClient } from '@angular/common/http';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

// PWA Service-Worker registrieren (online-only cache, /api/ network-only).
// Wir nutzen kein @angular/service-worker — eigene 80-Zeilen-Implementation
// in public/sw.js die per angular.json mit ins dist/ kopiert wird.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[sw] Registrierung fehlgeschlagen:', err);
    });
  });
}

bootstrapApplication(AppComponent, {
  providers: [
    {
      provide: TranslateModule,
      useFactory: HttpLoaderFactory,
      deps: []
    },
    appConfig.providers,
    provideHttpClient(), provideCharts(withDefaultRegisterables())
  ],
}).catch((err) =>
  console.error(err)
);
