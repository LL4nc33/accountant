import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

@Component({
  selector: 'm-about',
  standalone: true,
  imports: [CommonModule, MFormSectionComponent],
  template: `
    <div class="m-about-hero">
      <div class="m-about-eyebrow">Über</div>
      <h1 class="m-about-brandline">accountant</h1>
      <p class="m-about-subtitle">Selbstbuch für AT-EPU. Buchhaltung mit DACH-Fokus.</p>
    </div>

    <m-form-section title="Info">
      <dl class="m-kv">
        <dt>Version</dt><dd>{{ version }}</dd>
        <dt>Lizenz</dt><dd><a href="https://www.gnu.org/licenses/agpl-3.0.txt" target="_blank" rel="noopener">AGPL-3.0</a></dd>
        <dt>Repository</dt><dd><a href="https://github.com/LL4nc33/accountant" target="_blank" rel="noopener">github.com/LL4nc33/accountant</a></dd>
        <dt>Copyright</dt><dd>© 2026 LL4nc33</dd>
      </dl>
    </m-form-section>

    <m-form-section title="AGPL §13">
      <p class="m-about-note">
        Wer accountant modifiziert und über ein Netzwerk anbietet (Webdienst, SaaS), muss die
        geänderte Quellcode-Version an die Nutzer dieses Dienstes herausgeben.
        Self-hosted für die eigene Firma: keine Verpflichtungen außer Lizenz-Notice.
      </p>
    </m-form-section>
  `,
  styles: [`
    .m-about-hero {
      margin: 0 0 1.5rem;
    }
    .m-about-eyebrow {
      font-size: 0.8rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 0.3rem;
    }
    .m-about-brandline {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 2rem;
      margin: 0 0 0.3rem;
      line-height: 1.1;
    }
    .m-about-subtitle {
      color: #555;
      margin: 0;
      font-size: 0.95rem;
    }
    .m-about-note {
      font-size: 0.9rem;
      color: #444;
      line-height: 1.5;
      margin: 0;
    }
  `],
  styleUrls: ['../m-crm/m-customer-view.component.scss'],
})
export class MAboutComponent implements OnInit {
  version = '–';

  constructor(private http: HttpClient) {}

  async ngOnInit() {
    try {
      this.version = (await firstValueFrom(
        this.http.get('/VERSION', { responseType: 'text' }),
      )).trim();
    } catch {
      // ignore
    }
  }
}
