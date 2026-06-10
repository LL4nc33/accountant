import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { Person } from '../../../shared/entities/person';
import { Address } from '../../../shared/entities/address';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

@Component({
  selector: 'm-person-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule, MFormSectionComponent],
  templateUrl: './m-person-edit.component.html',
  styleUrls: ['../m-expenses/m-expense-edit.component.scss'],
})
export class MPersonEditComponent implements OnInit {
  @Input() id!: string;
  loading = true;
  saving = false;
  isNew = false;

  entity!: Person;
  primaryAddress: Address | null = null;

  birthdateStr = '';

  constructor(private router: Router, private toastr: ToastrService) {}

  async ngOnInit() {
    if (this.id === 'new-person') {
      this.isNew = true;
      this.entity = remult.repo(Person).create();
      this.entity.paymentTermsDays = 14;
    } else {
      const found = await remult.repo(Person).findFirst({ id: this.id });
      if (!found) {
        this.toastr.error('Person nicht gefunden');
        this.router.navigate(['/m/customers']);
        return;
      }
      this.entity = found;
      if (this.entity.birthdate) {
        const d = new Date(this.entity.birthdate);
        if (!isNaN(d.getTime())) this.birthdateStr = d.toISOString().substring(0, 10);
      }
      // erste Adresse laden
      const addrs = await remult.repo(Address).find({ where: { customerId: this.entity.id } });
      this.primaryAddress = addrs[0] ?? null;
    }
    this.loading = false;
  }

  async save() {
    this.saving = true;
    try {
      if (this.birthdateStr) this.entity.birthdate = new Date(this.birthdateStr);
      this.entity = await remult.repo(Person).save(this.entity);
      if (this.primaryAddress) {
        this.primaryAddress.customerId = this.entity.id;
        await remult.repo(Address).save(this.primaryAddress);
      }
      this.toastr.success('Person gespeichert');
      this.router.navigate(['/m/customer', this.entity.id]);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }

  addAddress() {
    this.primaryAddress = remult.repo(Address).create();
    this.primaryAddress.country = 'AT';
  }

  cancel() { this.router.navigate(this.isNew ? ['/m/customers'] : ['/m/customer', this.entity.id]); }
}
