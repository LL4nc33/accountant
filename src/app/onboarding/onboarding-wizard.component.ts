import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { CompanySettings, countries } from '../../shared/entities/company-settings';

@Component({
  selector: 'app-onboarding-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule],
  templateUrl: './onboarding-wizard.component.html',
  styleUrl: './onboarding-wizard.component.scss',
})
export class OnboardingWizardComponent implements OnInit {
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
      this.toastr.warning(err?.message ?? 'Daten konnten nicht gespeichert werden.');
    }
    this.router.navigate(['/']);
  }

  async finish() {
    if (!this.settings) return;
    this.saving = true;
    this.settings.onboardingDismissed = true;
    try {
      this.settings = await this.repo.save(this.settings);
      this.toastr.success('Setup abgeschlossen — viel Erfolg!');
      this.router.navigate(['/']);
    } catch (err: any) {
      this.toastr.error(err?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }
}
