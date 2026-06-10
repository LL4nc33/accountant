import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { CompanySettings } from '../../shared/entities/company-settings';
import { ModulesService } from '../core/modules.service';
import { EditShellComponent, EditTabDirective } from '../core/edit-shell/edit-shell.component';

@Component({
  selector: 'app-modules-settings',
  imports: [CommonModule, FormsModule, ClarityModule, EditShellComponent, EditTabDirective],
  templateUrl: './modules-settings.component.html',
  styleUrl: './modules-settings.component.scss',
})
export class ModulesSettingsComponent implements OnInit {
  settings: CompanySettings | null = null;
  saving = false;

  constructor(
    private toastr: ToastrService,
    private modules: ModulesService,
  ) {}

  async ngOnInit() {
    this.settings = (await remult.repo(CompanySettings).findFirst()) ?? null;
  }

  async save() {
    if (!this.settings) return;
    this.saving = true;
    try {
      this.settings = await remult.repo(CompanySettings).save(this.settings);
      this.modules.updateLocal(this.settings);
      this.toastr.success('Module aktualisiert.');
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Speichern fehlgeschlagen.', 'Fehler');
    } finally {
      this.saving = false;
    }
  }
}
