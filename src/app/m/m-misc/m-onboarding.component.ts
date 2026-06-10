import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { CompanySettings, countries } from '../../../shared/entities/company-settings';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

@Component({
  selector: 'm-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule, MFormSectionComponent],
  template: `
    <p *ngIf="!settings" class="m-muted">Lädt …</p>

    <ng-container *ngIf="settings">
      <div class="m-onb-hero">
        <div class="m-onb-eyebrow">Setup · Schritt {{ step }} von 3</div>
        <h1 class="m-onb-title">Willkommen</h1>
        <p class="m-onb-lead">Drei kurze Schritte zum rechtssicheren PDF. Später unter <em>Einstellungen → Firma</em> anpassbar.</p>
        <ul class="m-stepbar">
          <li [class.active]="step === 1" [class.done]="step > 1">Firma</li>
          <li [class.active]="step === 2" [class.done]="step > 2">Steuer</li>
          <li [class.active]="step === 3">Bank</li>
        </ul>
      </div>

      <form class="m-form" (ngSubmit)="primary()">

        <ng-container *ngIf="step === 1">
          <m-form-section title="Wer rechnet ab?">
            <p class="m-muted-small">Diese Daten erscheinen oben links auf jeder Rechnung.</p>
            <label class="m-field">
              <span>Firmenname *</span>
              <input type="text" name="name" [(ngModel)]="settings.name" required />
            </label>
            <label class="m-field">
              <span>Rechtsform / Zusatz</span>
              <input type="text" name="nameAddon" [(ngModel)]="settings.nameAddon" placeholder="e.U., GmbH, …" />
            </label>
            <label class="m-field">
              <span>Straße *</span>
              <input type="text" name="addressStreet" [(ngModel)]="settings.addressStreet" required />
            </label>
            <label class="m-field">
              <span>PLZ *</span>
              <input type="text" name="addressZip" [(ngModel)]="settings.addressZip" required inputmode="numeric" />
            </label>
            <label class="m-field">
              <span>Stadt *</span>
              <input type="text" name="addressCity" [(ngModel)]="settings.addressCity" required />
            </label>
            <label class="m-field">
              <span>Land *</span>
              <select name="country" [(ngModel)]="settings.country">
                <option *ngFor="let c of countries" [value]="c">{{ c }}</option>
              </select>
            </label>
          </m-form-section>
        </ng-container>

        <ng-container *ngIf="step === 2">
          <m-form-section title="Wie versteuerst du?">
            <p class="m-muted-small">Kleinunternehmer entscheidet ob USt am Beleg auftaucht.</p>
            <label class="m-toggle-row">
              <input type="checkbox" name="isKleinunternehmer" [(ngModel)]="settings.isKleinunternehmer" />
              <span>Kleinunternehmer (§6 Abs. 1 Z 27 UStG)</span>
            </label>
            <label class="m-field">
              <span>UID / USt-ID</span>
              <input type="text" name="vatId" [(ngModel)]="settings.vatId" placeholder="ATU12345678" />
            </label>
            <ng-container *ngIf="settings.country === 'AT'">
              <label class="m-field">
                <span>GISA-Zahl</span>
                <input type="text" name="gisaZahl" [(ngModel)]="settings.gisaZahl" placeholder="21345678" inputmode="numeric" />
              </label>
              <label class="m-field">
                <span>GISA-Behörde</span>
                <input type="text" name="gisaAuthority" [(ngModel)]="settings.gisaAuthority" placeholder="Magistrat der Stadt Wien" />
              </label>
            </ng-container>
            <label class="m-field">
              <span>Steuernummer (Finanzamt)</span>
              <input type="text" name="taxNumber" [(ngModel)]="settings.taxNumber" />
            </label>
          </m-form-section>
        </ng-container>

        <ng-container *ngIf="step === 3">
          <m-form-section title="Wohin überweisen Kunden?">
            <p class="m-muted-small">IBAN landet im PDF-Footer. E-Mail/Telefon optional.</p>
            <label class="m-field">
              <span>IBAN</span>
              <input type="text" name="iban" [(ngModel)]="settings.iban" placeholder="AT00 0000 0000 0000 0000" />
            </label>
            <label class="m-field">
              <span>BIC</span>
              <input type="text" name="bic" [(ngModel)]="settings.bic" />
            </label>
            <label class="m-field">
              <span>Bankname</span>
              <input type="text" name="bankName" [(ngModel)]="settings.bankName" />
            </label>
            <label class="m-field">
              <span>E-Mail</span>
              <input type="email" name="email" [(ngModel)]="settings.email" />
            </label>
            <label class="m-field">
              <span>Telefon</span>
              <input type="tel" name="phone" [(ngModel)]="settings.phone" />
            </label>
            <label class="m-field">
              <span>Website</span>
              <input type="url" name="website" [(ngModel)]="settings.website" />
            </label>
          </m-form-section>
        </ng-container>

        <div class="m-form-actions">
          <button type="button" class="m-pill" (click)="dismiss()">Später</button>
          <button type="button" class="m-pill" *ngIf="step > 1" (click)="back()">Zurück</button>
          <button type="button" class="m-pill m-pill-primary" *ngIf="step < 3" (click)="next()">Weiter</button>
          <button type="button" class="m-pill m-pill-primary" *ngIf="step === 3" [disabled]="saving" (click)="finish()">
            {{ saving ? 'Speichert…' : 'Fertig' }}
          </button>
        </div>
      </form>
    </ng-container>
  `,
  styles: [`
    .m-onb-hero {
      margin: 0 0 1.5rem;
    }
    .m-onb-eyebrow {
      font-size: 0.75rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 0.3rem;
    }
    .m-onb-title {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 1.8rem;
      margin: 0 0 0.4rem;
      line-height: 1.1;
    }
    .m-onb-lead {
      color: #555;
      margin: 0 0 1rem;
      font-size: 0.95rem;
      line-height: 1.4;
    }
    .m-onb-lead em { font-style: italic; color: #1A1A1A; }
    .m-stepbar {
      display: flex;
      gap: 0.5rem;
      padding: 0;
      margin: 0.5rem 0 0;
      list-style: none;
      font-size: 0.8rem;
    }
    .m-stepbar li {
      flex: 1;
      text-align: center;
      padding: 0.35rem 0.4rem;
      border-radius: 4px;
      background: #F0F0F0;
      color: #888;
      &.active { background: #0072a3; color: white; font-weight: 600; }
      &.done { background: #D4EDDA; color: #2D5A27; }
    }
    .m-toggle-row {
      display: flex;
      gap: 0.6rem;
      align-items: flex-start;
      padding: 0.5rem 0;
      font-size: 0.95rem;
      input { margin-top: 0.2rem; }
    }
  `],
  styleUrls: ['../m-expenses/m-expense-edit.component.scss', '../m-crm/m-customer-view.component.scss'],
})
export class MOnboardingComponent implements OnInit {
  countries = countries;
  repo = remult.repo(CompanySettings);
  settings?: CompanySettings;
  step: 1 | 2 | 3 = 1;
  saving = false;

  constructor(private toastr: ToastrService, private router: Router) {}

  async ngOnInit() {
    this.settings = (await this.repo.findFirst()) ?? this.repo.create();
  }

  get step1Valid(): boolean {
    if (!this.settings) return false;
    return Boolean(
      this.settings.name?.trim() &&
        this.settings.addressStreet?.trim() &&
        this.settings.addressZip?.trim() &&
        this.settings.addressCity?.trim() &&
        this.settings.country,
    );
  }

  primary() {
    if (this.step < 3) this.next();
    else this.finish();
  }

  next() {
    if (this.step === 1 && !this.step1Valid) {
      this.toastr.warning('Bitte Firmenname, Straße, PLZ, Stadt und Land ausfüllen.');
      return;
    }
    if (this.step < 3) this.step = (this.step + 1) as 1 | 2 | 3;
  }

  back() {
    if (this.step > 1) this.step = (this.step - 1) as 1 | 2 | 3;
  }

  async dismiss() {
    if (!this.settings) return;
    this.settings.onboardingDismissed = true;
    try {
      await this.repo.save(this.settings);
    } catch (err: any) {
      this.toastr.warning(err?.message ?? 'Speichern fehlgeschlagen');
    }
    this.router.navigate(['/m']);
  }

  async finish() {
    if (!this.settings) return;
    this.saving = true;
    this.settings.onboardingDismissed = true;
    try {
      this.settings = await this.repo.save(this.settings);
      this.toastr.success('Setup abgeschlossen — viel Erfolg!');
      this.router.navigate(['/m']);
    } catch (err: any) {
      this.toastr.error(err?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }
}
