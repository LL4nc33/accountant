import { CommonModule } from '@angular/common';
import { Component, OnInit, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import { remult } from 'remult';
import { Project } from '../../../shared/entities/project';
import { TimeEntry } from '../../../shared/entities/time-entry';
import { Person } from '../../../shared/entities/person';
import { Company } from '../../../shared/entities/company';

@Component({
  selector: 'app-project-view',
  imports: [CommonModule, FormsModule, ClarityModule, RouterLink],
  templateUrl: './project-view.component.html',
  styleUrl: './project-view.component.scss',
})
export class ProjectViewComponent implements OnInit {
  @Input() id!: string;
  project?: Project;
  customerName = '';
  customerLink: string | null = null;
  entries: TimeEntry[] = [];
  showOnlyOpen = true;
  showGenerateModal = false;
  generating = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private toastr: ToastrService,
  ) {}

  async ngOnInit() {
    const pid = this.route.snapshot.paramMap.get('id') ?? this.id;
    const found = await remult.repo(Project).findFirst({ id: pid });
    if (!found) {
      this.router.navigate(['/pm/overview']);
      return;
    }
    this.project = found;
    const person = await remult.repo(Person).findFirst({ id: this.project.customerId });
    if (person) {
      this.customerName = person.displayName?.trim() || '(unbenannte Person)';
      this.customerLink = `/crm/person/${person.id}`;
    } else {
      const company = await remult.repo(Company).findFirst({ id: this.project.customerId });
      if (company) {
        this.customerName = company.name || '(unbenannte Firma)';
        this.customerLink = `/crm/company/${company.id}`;
      } else {
        this.customerName = '(unbekannt)';
      }
    }
    await this.refreshEntries();
  }

  async refreshEntries() {
    this.entries = await remult.repo(TimeEntry).find({
      where: { projectId: this.project!.id },
      orderBy: { date: 'desc' as any },
    });
  }

  get filteredEntries(): TimeEntry[] {
    return this.showOnlyOpen ? this.entries.filter(e => !e.billedInvoiceItemId) : this.entries;
  }

  get openEntries(): TimeEntry[] {
    return this.entries.filter(e => !e.billedInvoiceItemId);
  }

  get totalOpenHours(): number {
    return this.openEntries.reduce((a, b) => a + b.hours, 0);
  }

  get totalOpenAmount(): number {
    return this.openEntries.reduce((a, b) => a + b.amount, 0);
  }

  openGenerateModal() {
    if (this.openEntries.length === 0) {
      this.toastr.warning('Keine offenen Stunden vorhanden');
      return;
    }
    this.showGenerateModal = true;
  }

  async generateInvoice() {
    if (!this.project) return;
    this.generating = true;
    try {
      const result = await firstValueFrom(this.http.post<{
        invoiceId: string;
        invoiceNumber: string;
        itemCount: number;
        totalNet: number;
      }>(`/api/projects/${this.project.id}/generate-invoice`, {}));
      this.toastr.success(
        `Rechnung ${result.invoiceNumber} mit ${result.itemCount} Positionen erzeugt`,
      );
      this.showGenerateModal = false;
      this.router.navigate(['/om/invoice', result.invoiceId]);
    } catch (e: any) {
      const msg = e?.error?.error ?? 'Fehler beim Erzeugen';
      this.toastr.error(msg, undefined, { timeOut: 8000 });
      // Modal schließen damit User nicht festsitzt — Toast bleibt
      this.showGenerateModal = false;
    } finally {
      this.generating = false;
    }
  }
}
