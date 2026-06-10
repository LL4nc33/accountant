import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { Project, projectStatuses } from '../../../shared/entities/project';
import { Person } from '../../../shared/entities/person';
import { Company } from '../../../shared/entities/company';

interface CustomerOption { id: string; label: string; }

@Component({
  selector: 'app-project-edit',
  imports: [CommonModule, FormsModule, ClarityModule],
  templateUrl: './project-edit.component.html',
  styleUrl: './project-edit.component.scss',
})
export class ProjectEditComponent implements OnInit {
  statuses = projectStatuses;
  repo = remult.repo(Project);
  entity?: Project;
  customers: CustomerOption[] = [];
  saving = false;
  isNew = false;

  constructor(private route: ActivatedRoute, private router: Router, private toastr: ToastrService) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') ?? 'new';
    if (id === 'new') {
      this.entity = this.repo.create();
      this.isNew = true;
      // Convenience: ?customerId=... pre-selects the customer
      const preselect = this.route.snapshot.queryParamMap.get('customerId');
      if (preselect) this.entity.customerId = preselect;
    } else {
      const found = await this.repo.findFirst({ id });
      if (!found) {
        this.toastr.error('Projekt nicht gefunden');
        this.router.navigate(['/pm/overview']);
        return;
      }
      this.entity = found;
    }
    const persons = await remult.repo(Person).find();
    const companies = await remult.repo(Company).find();
    this.customers = [
      ...persons.map(p => ({ id: p.id, label: `${p.displayName} (Person)` })),
      ...companies.map(c => ({ id: c.id, label: `${c.displayName} (Firma)` })),
    ].sort((a, b) => a.label.localeCompare(b.label));
  }

  async save() {
    if (!this.entity) return;
    if (!this.entity.customerId) { this.toastr.error('Bitte Kunde wählen'); return; }
    if (!this.entity.name) { this.toastr.error('Bitte Projektname eingeben'); return; }
    this.saving = true;
    try {
      this.entity = await this.repo.save(this.entity);
      this.toastr.success('Projekt gespeichert');
      this.router.navigate(['/pm/project', this.entity.id]);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }

  async deleteProject() {
    if (!this.entity?.id || this.isNew) return;
    if (!confirm('Projekt wirklich löschen? Zeitbuchungen bleiben erhalten.')) return;
    await this.repo.delete(this.entity.id);
    this.router.navigate(['/pm/overview']);
  }

  async toggleArchive() {
    if (!this.entity?.id || this.isNew) return;
    this.entity.archived = !this.entity.archived;
    this.entity = await this.repo.save(this.entity);
    this.toastr.success(this.entity.archived ? 'Projekt archiviert' : 'Projekt reaktiviert');
    this.router.navigate(['/pm/overview']);
  }
}
