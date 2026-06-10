import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { CompanySettings } from '../../../shared/entities/company-settings';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

@Component({
  selector: 'm-modules-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, MFormSectionComponent],
  template: `
    <p *ngIf="loading" class="m-muted">Lädt …</p>
    <p class="m-muted-small">Nur was du nutzt aktivieren. Daten bleiben beim Deaktivieren erhalten — Modul ein-/aus-schalten ist reversibel.</p>

    <form *ngIf="!loading && settings" class="m-form" (ngSubmit)="save()">
      <m-form-section title="Kern-Module">
        <label class="m-toggle"><input type="checkbox" name="moduleProjects" [(ngModel)]="settings.moduleProjects" /> Projekte + Zeiterfassung</label>
        <label class="m-toggle"><input type="checkbox" name="moduleProducts" [(ngModel)]="settings.moduleProducts" /> Produkt-Katalog</label>
        <label class="m-toggle"><input type="checkbox" name="moduleExpenses" [(ngModel)]="settings.moduleExpenses" /> Ausgaben / Eingangsrechnungen</label>
        <label class="m-toggle"><input type="checkbox" name="moduleWorkHours" [(ngModel)]="settings.moduleWorkHours" /> Arbeitszeit-Aggregation</label>
      </m-form-section>

      <m-form-section title="Admin + Automation">
        <label class="m-toggle"><input type="checkbox" name="moduleTaxExport" [(ngModel)]="settings.moduleTaxExport" /> Finanzamt-Jahres-Export</label>
        <label class="m-toggle"><input type="checkbox" name="moduleLlm" [(ngModel)]="settings.moduleLlm" /> KI-Assistent (lokal)</label>
        <label class="m-toggle"><input type="checkbox" name="moduleReminder" [(ngModel)]="settings.moduleReminder" /> Mahnwesen</label>
        <label class="m-toggle"><input type="checkbox" name="moduleSvs" [(ngModel)]="settings.moduleSvs" /> SVS-Vorschau (AT)</label>
        <label class="m-toggle"><input type="checkbox" name="moduleEst" [(ngModel)]="settings.moduleEst" /> ESt-Vorschau (AT)</label>
        <label class="m-toggle"><input type="checkbox" name="moduleAssets" [(ngModel)]="settings.moduleAssets" /> Anlagenverzeichnis / AfA</label>
        <label class="m-toggle"><input type="checkbox" name="moduleTravel" [(ngModel)]="settings.moduleTravel" /> Reisekosten</label>
        <label class="m-toggle"><input type="checkbox" name="moduleCashbook" [(ngModel)]="settings.moduleCashbook" /> Kassabuch (nicht RKSV)</label>
      </m-form-section>

      <div class="m-form-actions">
        <button type="submit" class="m-pill m-pill-primary" [disabled]="saving">{{ saving ? 'Speichert…' : 'Speichern' }}</button>
      </div>
    </form>
  `,
  styles: [`
    .m-muted-small { color: #666; font-size: 0.9rem; margin-bottom: 1rem; line-height: 1.4; }
    .m-toggle {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.7rem 0;
      font-size: 1rem;
      cursor: pointer;
      input { width: 20px; height: 20px; }
    }
    .m-form-actions {
      position: sticky;
      bottom: 0;
      background: rgba(250, 250, 250, 0.95);
      backdrop-filter: blur(8px);
      padding: 0.8rem 0;
      padding-bottom: calc(0.8rem + env(safe-area-inset-bottom));
      margin: 0 -1rem;
      padding-left: 1rem;
      padding-right: 1rem;
      border-top: 1px solid #E8E8E8;
      display: flex;
      gap: 0.6rem;
    }
    .m-pill {
      flex: 1;
      padding: 0.8rem 1rem;
      background: white;
      border: 1px solid #DCDCDC;
      border-radius: 999px;
      font-size: 0.95rem;
      color: #1A1A1A;
      cursor: pointer;
      min-height: 48px;
      &.m-pill-primary { background: #1A1A1A; color: white; border-color: #1A1A1A; }
      &:disabled { opacity: 0.5; }
    }
    .m-muted { color: #888; text-align: center; padding: 2rem 1rem; }
  `],
})
export class MModulesSettingsComponent implements OnInit {
  loading = true;
  saving = false;
  settings?: CompanySettings;

  constructor(private toastr: ToastrService) {}

  async ngOnInit() {
    this.settings = (await remult.repo(CompanySettings).findFirst()) ?? undefined;
    this.loading = false;
  }

  async save() {
    if (!this.settings) return;
    this.saving = true;
    try {
      this.settings = await remult.repo(CompanySettings).save(this.settings);
      this.toastr.success('Module gespeichert');
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }
}
