import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { Product } from '../../../shared/entities/product';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

@Component({
  selector: 'm-product-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, ClarityModule, MFormSectionComponent],
  template: `
    <p *ngIf="loading" class="m-muted">Lädt …</p>
    <form *ngIf="!loading" class="m-form" (ngSubmit)="save()">
      <m-form-section title="Produkt">
        <label class="m-field">
          <span>Name *</span>
          <input type="text" name="name" [(ngModel)]="entity.name" required />
        </label>
        <label class="m-field">
          <span>Beschreibung</span>
          <textarea name="description" [(ngModel)]="entity.description" rows="3"></textarea>
        </label>
        <label class="m-field">
          <span>Einheit</span>
          <input type="text" name="unit" [(ngModel)]="entity.unit" placeholder="Stk, h, Pauschale …" />
        </label>
        <label class="m-field">
          <span>Standard-Preis (netto, €)</span>
          <input type="number" step="0.01" name="defaultPrice" [(ngModel)]="entity.defaultPrice" inputmode="decimal" />
        </label>
        <label class="m-field">
          <span>Standard-USt (%)</span>
          <input type="number" step="0.5" name="defaultVat" [(ngModel)]="entity.defaultVat" inputmode="decimal" />
        </label>
      </m-form-section>
      <div class="m-form-actions">
        <button type="button" class="m-pill" (click)="cancel()">Abbrechen</button>
        <button *ngIf="!isNew" type="button" class="m-pill" (click)="toggleArchive()">{{ entity.archived ? 'Reaktivieren' : 'Archivieren' }}</button>
        <button type="submit" class="m-pill m-pill-primary" [disabled]="saving">{{ saving ? 'Speichert…' : 'Speichern' }}</button>
      </div>
    </form>
  `,
  styleUrls: ['../m-expenses/m-expense-edit.component.scss'],
})
export class MProductEditComponent implements OnInit {
  @Input() id!: string;
  loading = true;
  saving = false;
  entity!: Product;
  isNew = false;

  constructor(private router: Router, private toastr: ToastrService) {}

  async ngOnInit() {
    if (this.id === 'new') {
      this.isNew = true;
      this.entity = remult.repo(Product).create();
      this.entity.defaultVat = 20;
    } else {
      const found = await remult.repo(Product).findFirst({ id: this.id });
      if (!found) {
        this.toastr.error('Produkt nicht gefunden');
        this.router.navigate(['/m/products']);
        return;
      }
      this.entity = found;
    }
    this.loading = false;
  }

  async save() {
    this.saving = true;
    try {
      this.entity = await remult.repo(Product).save(this.entity);
      this.toastr.success(this.isNew ? 'Produkt angelegt' : 'Produkt gespeichert');
      this.router.navigate(['/m/products']);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }

  async toggleArchive() {
    this.entity.archived = !this.entity.archived;
    this.entity = await remult.repo(Product).save(this.entity);
    this.toastr.success(this.entity.archived ? 'Archiviert' : 'Reaktiviert');
  }

  cancel() { this.router.navigate(['/m/products']); }
}
