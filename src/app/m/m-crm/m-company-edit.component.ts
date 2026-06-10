import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { Company } from '../../../shared/entities/company';
import { Address } from '../../../shared/entities/address';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

@Component({
  selector: 'm-company-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule, MFormSectionComponent],
  template: `
    <p *ngIf="loading" class="m-muted">Lädt …</p>

    <form *ngIf="!loading" class="m-form" (ngSubmit)="save()">
      <m-form-section title="Stammdaten">
        <label class="m-field">
          <span>Firmenname *</span>
          <input type="text" name="name" [(ngModel)]="entity.name" required />
        </label>
        <label class="m-field">
          <span>Namenszusatz</span>
          <input type="text" name="nameAddon" [(ngModel)]="entity.nameAddon" placeholder="z.B. GmbH, OG, KG" />
        </label>
        <label class="m-field">
          <span>Kundennummer</span>
          <input type="text" name="customerNumber" [(ngModel)]="entity.customerNumber" />
        </label>
        <label class="m-field">
          <span>UID / USt-ID</span>
          <input type="text" name="vatId" [(ngModel)]="entity.vatId" placeholder="z.B. ATU12345678" />
        </label>
      </m-form-section>

      <m-form-section title="Kontakt">
        <label class="m-field">
          <span>E-Mail</span>
          <input type="email" name="email" [(ngModel)]="entity.email" />
        </label>
        <label class="m-field">
          <span>Telefon</span>
          <input type="tel" name="phone" [(ngModel)]="entity.phone" />
        </label>
      </m-form-section>

      <m-form-section title="Anschrift">
        <button *ngIf="!primaryAddress" type="button" class="m-pill" (click)="addAddress()">+ Adresse hinzufügen</button>
        <ng-container *ngIf="primaryAddress">
          <label class="m-field">
            <span>Straße</span>
            <input type="text" name="street" [(ngModel)]="primaryAddress.street" />
          </label>
          <label class="m-field">
            <span>PLZ</span>
            <input type="text" name="zip" [(ngModel)]="primaryAddress.zip" />
          </label>
          <label class="m-field">
            <span>Stadt</span>
            <input type="text" name="city" [(ngModel)]="primaryAddress.city" />
          </label>
          <label class="m-field">
            <span>Land</span>
            <select name="country" [(ngModel)]="primaryAddress.country">
              <option value="AT">AT</option>
              <option value="DE">DE</option>
              <option value="CH">CH</option>
            </select>
          </label>
        </ng-container>
      </m-form-section>

      <m-form-section title="Zahlungs-Konditionen">
        <label class="m-field">
          <span>Zahlungsziel (Tage)</span>
          <input type="number" min="0" max="365" name="paymentTermsDays" [(ngModel)]="entity.paymentTermsDays" inputmode="numeric" />
        </label>
        <label class="m-field">
          <span>Skonto-Satz (%)</span>
          <input type="number" min="0" max="100" step="0.5" name="discountPercent" [(ngModel)]="entity.discountPercent" inputmode="decimal" />
        </label>
        <label class="m-field">
          <span>Standard-Stundensatz (€)</span>
          <input type="number" step="0.01" name="defaultHourlyRate" [(ngModel)]="entity.defaultHourlyRate" inputmode="decimal" />
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
export class MCompanyEditComponent implements OnInit {
  @Input() id!: string;
  loading = true;
  saving = false;
  isNew = false;

  entity!: Company;
  primaryAddress: Address | null = null;

  constructor(private router: Router, private toastr: ToastrService) {}

  async ngOnInit() {
    if (!this.id || this.id === 'new-company' || this.id === 'new') {
      this.isNew = true;
      this.entity = remult.repo(Company).create();
      this.entity.paymentTermsDays = 14;
    } else {
      const found = await remult.repo(Company).findFirst({ id: this.id });
      if (!found) {
        this.toastr.error('Firma nicht gefunden');
        this.router.navigate(['/m/customers']);
        return;
      }
      this.entity = found;
      const addrs = await remult.repo(Address).find({ where: { customerId: this.entity.id } });
      this.primaryAddress = addrs[0] ?? null;
    }
    this.loading = false;
  }

  async save() {
    this.saving = true;
    try {
      this.entity = await remult.repo(Company).save(this.entity);
      if (this.primaryAddress) {
        this.primaryAddress.customerId = this.entity.id;
        await remult.repo(Address).save(this.primaryAddress);
      }
      this.toastr.success('Firma gespeichert');
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
