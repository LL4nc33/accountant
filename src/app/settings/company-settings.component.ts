import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { CompanySettings, countries } from '../../shared/entities/company-settings';
import { EditShellComponent, EditTabDirective } from '../core/edit-shell/edit-shell.component';

@Component({
  selector: 'app-company-settings',
  imports: [CommonModule, FormsModule, ClarityModule, TranslateModule, EditShellComponent, EditTabDirective],
  templateUrl: './company-settings.component.html',
  styleUrl: './company-settings.component.scss',
})
export class CompanySettingsComponent implements OnInit {
  countries = countries;
  repo = remult.repo(CompanySettings);
  settings?: CompanySettings;
  saving = false;

  constructor(private toastr: ToastrService) {}

  async ngOnInit() {
    this.settings = (await this.repo.findFirst()) ?? this.repo.create();
  }

  async save() {
    if (!this.settings) return;
    this.saving = true;
    try {
      this.settings = await this.repo.save(this.settings);
      this.toastr.success('Firmen-Einstellungen gespeichert');
    } catch (err: any) {
      this.toastr.error(err?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }

  /**
   * Logo-Upload: liest die Datei als Data-URL und speichert sie ins
   * CompanySettings.logoDataUrl-Feld. Soft-Limit 500KB raw — größeres
   * Logo macht die JSON-Storage groß ohne PDF-Qualitätsvorteil.
   */
  async onLogoFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.settings) return;
    if (!file.type.startsWith('image/')) {
      this.toastr.error('Nur Bild-Dateien (PNG/JPG)');
      input.value = '';
      return;
    }
    if (file.size > 500 * 1024) {
      this.toastr.error(`Logo zu groß (${Math.round(file.size / 1024)} KB) — max 500 KB`);
      input.value = '';
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
    this.settings.logoDataUrl = dataUrl;
    input.value = '';
  }

  async removeLogo(): Promise<void> {
    if (!this.settings) return;
    this.settings.logoDataUrl = '';
    // Sofort persistieren — User erwartet bei einem expliziten "Entfernen"-
    // Klick eine sofortige Wirkung, nicht „warten bis Save geklickt wird".
    await this.save();
  }
}
