import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { TimeEntry } from '../../../shared/entities/time-entry';
import { Project } from '../../../shared/entities/project';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

@Component({
  selector: 'm-time-entry-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule, MFormSectionComponent],
  template: `
    <p *ngIf="loading" class="m-muted">Lädt …</p>
    <form *ngIf="!loading" class="m-form" (ngSubmit)="save()">
      <m-form-section title="Zeitbuchung">
        <label class="m-field">
          <span>Projekt *</span>
          <select name="projectId" [(ngModel)]="entity.projectId" [disabled]="locked" required>
            <option value="">— wählen —</option>
            <option *ngFor="let p of projects" [value]="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="m-field">
          <span>Datum *</span>
          <input type="date" name="dateStr" [(ngModel)]="dateStr" [disabled]="locked" required />
        </label>
        <label class="m-field">
          <span>Stunden *</span>
          <input type="number" step="0.25" min="0" name="hours" [(ngModel)]="entity.hours" [disabled]="locked" inputmode="decimal" required />
        </label>
        <label class="m-field">
          <span>Stundensatz (€)</span>
          <input type="number" step="0.01" name="hourlyRate" [(ngModel)]="entity.hourlyRate" [disabled]="locked" inputmode="decimal" />
        </label>
        <label class="m-field">
          <span>Beschreibung</span>
          <textarea name="description" [(ngModel)]="entity.description" [disabled]="locked" rows="3"></textarea>
        </label>
        <p *ngIf="locked" class="m-muted-small">
          Diese Buchung ist bereits abgerechnet und kann nicht mehr geändert werden.
        </p>
      </m-form-section>
      <div class="m-form-actions">
        <button type="button" class="m-pill" (click)="cancel()">Zurück</button>
        <button type="submit" class="m-pill m-pill-primary" *ngIf="!locked" [disabled]="saving">{{ saving ? 'Speichert…' : 'Speichern' }}</button>
      </div>
    </form>
  `,
  styleUrls: ['../m-expenses/m-expense-edit.component.scss'],
})
export class MTimeEntryEditComponent implements OnInit {
  @Input() id!: string;
  loading = true;
  saving = false;
  entity!: TimeEntry;
  projects: Project[] = [];
  dateStr = '';
  locked = false;

  constructor(private router: Router, private toastr: ToastrService) {}

  async ngOnInit() {
    if (this.id === 'new') {
      this.entity = remult.repo(TimeEntry).create();
      const t = new Date();
      this.entity.date = t;
      this.dateStr = t.toISOString().substring(0, 10);
    } else {
      const found = await remult.repo(TimeEntry).findFirst({ id: this.id });
      if (!found) {
        this.toastr.error('Zeitbuchung nicht gefunden');
        this.router.navigate(['/m/time-entries']);
        return;
      }
      this.entity = found;
      if (this.entity.date) this.dateStr = new Date(this.entity.date).toISOString().substring(0, 10);
      this.locked = !!this.entity.billedInvoiceItemId;
    }
    this.projects = await remult.repo(Project).find({ where: { archived: false } });
    this.loading = false;
  }

  async save() {
    this.saving = true;
    try {
      if (this.dateStr) this.entity.date = new Date(this.dateStr);
      this.entity = await remult.repo(TimeEntry).save(this.entity);
      this.toastr.success('Zeitbuchung gespeichert');
      this.router.navigate(['/m/time-entries']);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }

  cancel() { this.router.navigate(['/m/time-entries']); }
}
