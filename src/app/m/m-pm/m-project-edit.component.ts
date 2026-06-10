import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { Project } from '../../../shared/entities/project';
import { Person } from '../../../shared/entities/person';
import { Company } from '../../../shared/entities/company';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

interface CustomerOption { id: string; label: string }

@Component({
  selector: 'm-project-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule, MFormSectionComponent],
  template: `
    <p *ngIf="loading" class="m-muted">Lädt …</p>
    <form *ngIf="!loading" class="m-form" (ngSubmit)="save()">
      <m-form-section title="Projekt">
        <label class="m-field">
          <span>Name *</span>
          <input type="text" name="name" [(ngModel)]="entity.name" required />
        </label>
        <label class="m-field">
          <span>Kunde</span>
          <select name="customerId" [(ngModel)]="entity.customerId">
            <option value="">— wählen —</option>
            <option *ngFor="let c of customers" [value]="c.id">{{ c.label }}</option>
          </select>
        </label>
        <label class="m-field">
          <span>Status</span>
          <select name="status" [(ngModel)]="entity.status">
            <option value="active">Aktiv</option>
            <option value="closed">Geschlossen</option>
          </select>
        </label>
        <label class="m-field">
          <span>Stundensatz (€) — leer für CompanySettings-Default</span>
          <input type="number" step="0.01" name="hourlyRate" [(ngModel)]="entity.hourlyRate" inputmode="decimal" />
        </label>
      </m-form-section>
      <div class="m-form-actions">
        <button type="button" class="m-pill" (click)="cancel()">Abbrechen</button>
        <button type="submit" class="m-pill m-pill-primary" [disabled]="saving">{{ saving ? 'Speichert…' : 'Speichern' }}</button>
      </div>
    </form>
  `,
  styleUrls: ['../m-expenses/m-expense-edit.component.scss'],
})
export class MProjectEditComponent implements OnInit {
  @Input() id!: string;
  loading = true;
  saving = false;
  entity!: Project;
  customers: CustomerOption[] = [];

  constructor(
    private router: Router,
    private toastr: ToastrService,
    private route: ActivatedRoute,
  ) {}

  async ngOnInit() {
    if (this.id === 'new') {
      this.entity = remult.repo(Project).create();
      const preselect = this.route.snapshot.queryParamMap.get('customerId');
      if (preselect) this.entity.customerId = preselect;
    } else {
      const found = await remult.repo(Project).findFirst({ id: this.id });
      if (!found) {
        this.toastr.error('Projekt nicht gefunden');
        this.router.navigate(['/m/projects']);
        return;
      }
      this.entity = found;
    }
    const [persons, companies] = await Promise.all([
      remult.repo(Person).find({ where: { archived: false } }),
      remult.repo(Company).find({ where: { archived: false } }),
    ]);
    this.customers = [
      ...persons.map((p) => ({ id: p.id, label: `${p.firstname ?? ''} ${p.lastname ?? ''}`.trim() })),
      ...companies.map((c) => ({ id: c.id, label: c.name ?? '—' })),
    ].sort((a, b) => a.label.localeCompare(b.label));
    this.loading = false;
  }

  async save() {
    this.saving = true;
    try {
      this.entity = await remult.repo(Project).save(this.entity);
      this.toastr.success('Projekt gespeichert');
      this.router.navigate(['/m/project', this.entity.id]);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }

  cancel() { this.router.navigate(['/m/projects']); }
}
