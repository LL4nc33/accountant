import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { TimeEntry } from '../../../shared/entities/time-entry';
import { Project } from '../../../shared/entities/project';
import { CompanySettings } from '../../../shared/entities/company-settings';

@Component({
  selector: 'app-time-entry-edit',
  imports: [CommonModule, FormsModule, ClarityModule, RouterLink],
  templateUrl: './time-entry-edit.component.html',
  styleUrl: './time-entry-edit.component.scss',
})
export class TimeEntryEditComponent implements OnInit {
  repo = remult.repo(TimeEntry);
  entity?: TimeEntry;
  projectName = '';
  isNew = false;
  saving = false;
  activeProjects: { id: string; label: string }[] = [];

  constructor(private route: ActivatedRoute, private router: Router, private toastr: ToastrService) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') ?? 'new';
    if (id === 'new') {
      this.entity = this.repo.create();
      this.entity.date = new Date();
      const projectId = this.route.snapshot.queryParamMap.get('projectId') ?? '';
      this.entity.projectId = projectId;
      this.isNew = true;
      await this.loadActiveProjects();
      if (projectId) {
        await this.applyProject(projectId);
      } else if (this.activeProjects.length === 1) {
        // Convenience: nur ein aktives Projekt → automatisch vorauswählen
        this.entity.projectId = this.activeProjects[0]!.id;
        await this.applyProject(this.activeProjects[0]!.id);
      }
    } else {
      const found = await this.repo.findFirst({ id });
      if (!found) {
        this.toastr.error('Eintrag nicht gefunden');
        this.router.navigate(['/pm/overview']);
        return;
      }
      this.entity = found;
      const p = await remult.repo(Project).findFirst({ id: this.entity.projectId });
      this.projectName = p?.name ?? '';
    }
  }

  private async loadActiveProjects() {
    const projects = await remult.repo(Project).find({
      where: { status: 'active', archived: false },
      orderBy: { name: 'asc' as any },
    });
    const personCache = new Map<string, string>();
    const companyCache = new Map<string, string>();
    const { Person } = await import('../../../shared/entities/person');
    const { Company } = await import('../../../shared/entities/company');
    this.activeProjects = await Promise.all(projects.map(async (p) => {
      let customer = personCache.get(p.customerId) ?? companyCache.get(p.customerId);
      if (!customer) {
        const person = await remult.repo(Person).findFirst({ id: p.customerId });
        if (person) {
          customer = person.displayName ?? '';
          personCache.set(p.customerId, customer);
        } else {
          const company = await remult.repo(Company).findFirst({ id: p.customerId });
          if (company) {
            customer = company.name ?? '';
            companyCache.set(p.customerId, customer);
          }
        }
      }
      return { id: p.id, label: customer ? `${p.name} — ${customer}` : p.name };
    }));
  }

  async onProjectChange(projectId: string) {
    if (!this.entity) return;
    this.entity.projectId = projectId;
    if (projectId) await this.applyProject(projectId);
  }

  private async applyProject(projectId: string) {
    if (!this.entity) return;
    const p = await remult.repo(Project).findFirst({ id: projectId });
    const settings = await remult.repo(CompanySettings).findFirst();
    if (!this.entity.hourlyRate) {
      this.entity.hourlyRate = p?.hourlyRate || settings?.defaultHourlyRate || 0;
    }
    this.projectName = p?.name ?? '';
  }

  async save() {
    if (!this.entity) return;
    if (this.entity.hours <= 0) { this.toastr.error('Stunden > 0 angeben'); return; }
    if (!this.entity.projectId) { this.toastr.error('Projekt fehlt'); return; }
    this.saving = true;
    try {
      this.entity = await this.repo.save(this.entity);
      this.toastr.success('Zeitbuchung gespeichert');
      this.router.navigate(['/pm/project', this.entity.projectId]);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }

  async deleteEntry() {
    if (!this.entity?.id || this.isNew) return;
    if (this.entity.billedInvoiceItemId) {
      this.toastr.error('Bereits abgerechnet — Eintrag kann nicht gelöscht werden');
      return;
    }
    if (!confirm('Eintrag wirklich löschen?')) return;
    const projectId = this.entity.projectId;
    await this.repo.delete(this.entity.id);
    this.router.navigate(['/pm/project', projectId]);
  }
}
