import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { CompanySettings, countries } from '../../../shared/entities/company-settings';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

@Component({
  selector: 'm-company-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, MFormSectionComponent],
  templateUrl: './m-company-settings.component.html',
  styleUrls: ['../m-expenses/m-expense-edit.component.scss'],
})
export class MCompanySettingsComponent implements OnInit {
  loading = true;
  saving = false;
  settings?: CompanySettings;
  countries = countries;

  constructor(private toastr: ToastrService, private router: Router) {}

  async ngOnInit() {
    this.settings = (await remult.repo(CompanySettings).findFirst()) ?? remult.repo(CompanySettings).create();
    this.loading = false;
  }

  async save() {
    if (!this.settings) return;
    this.saving = true;
    try {
      this.settings = await remult.repo(CompanySettings).save(this.settings);
      this.toastr.success('Firmen-Einstellungen gespeichert');
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }

  async onLogoFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.settings) return;
    if (!file.type.startsWith('image/')) {
      this.toastr.error('Nur Bild-Dateien'); input.value = ''; return;
    }
    if (file.size > 500 * 1024) {
      this.toastr.error('Max 500 KB'); input.value = ''; return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(r.error);
      r.onload = () => resolve(String(r.result));
      r.readAsDataURL(file);
    });
    this.settings.logoDataUrl = dataUrl;
    input.value = '';
  }

  async removeLogo(): Promise<void> {
    if (!this.settings) return;
    this.settings.logoDataUrl = '';
    await this.save();
  }
}
