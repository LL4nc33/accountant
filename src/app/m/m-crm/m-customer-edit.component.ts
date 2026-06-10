import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { remult } from 'remult';
import { Person } from '../../../shared/entities/person';
import { Company } from '../../../shared/entities/company';
import { MPersonEditComponent } from './m-person-edit.component';
import { MCompanyEditComponent } from './m-company-edit.component';

/**
 * Dispatcher: lädt den Kunden anhand der ID, prüft ob Person oder Firma
 * und rendert das entsprechende Edit-Formular inline.
 */
@Component({
  selector: 'm-customer-edit',
  standalone: true,
  imports: [CommonModule, MPersonEditComponent, MCompanyEditComponent],
  template: `
    <p *ngIf="loading" class="m-muted">Lädt …</p>
    <m-person-edit *ngIf="!loading && type === 'person'" [id]="id"></m-person-edit>
    <m-company-edit *ngIf="!loading && type === 'company'" [id]="id"></m-company-edit>
  `,
})
export class MCustomerEditComponent implements OnInit {
  @Input() id!: string;
  loading = true;
  type: 'person' | 'company' | null = null;

  constructor(private router: Router) {}

  async ngOnInit() {
    const person = await remult.repo(Person).findFirst({ id: this.id });
    if (person) { this.type = 'person'; this.loading = false; return; }
    const company = await remult.repo(Company).findFirst({ id: this.id });
    if (company) { this.type = 'company'; this.loading = false; return; }
    this.router.navigate(['/m/customers']);
  }
}
