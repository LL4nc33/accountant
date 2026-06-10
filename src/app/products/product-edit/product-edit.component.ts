import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { Product, productUnits } from '../../../shared/entities/product';

@Component({
  selector: 'app-product-edit',
  imports: [CommonModule, FormsModule, ClarityModule],
  templateUrl: './product-edit.component.html',
  styleUrl: './product-edit.component.scss',
})
export class ProductEditComponent implements OnInit {
  units = productUnits;
  repo = remult.repo(Product);
  entity?: Product;
  saving = false;
  isNew = false;

  constructor(private route: ActivatedRoute, private router: Router, private toastr: ToastrService) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') ?? 'new';
    if (id === 'new') {
      this.entity = this.repo.create();
      this.isNew = true;
    } else {
      const found = await this.repo.findFirst({ id });
      if (!found) {
        this.toastr.error('Produkt nicht gefunden');
        this.router.navigate(['/products']);
        return;
      }
      this.entity = found;
    }
  }

  async save() {
    if (!this.entity) return;
    this.saving = true;
    try {
      this.entity = await this.repo.save(this.entity);
      this.toastr.success('Produkt gespeichert');
      this.router.navigate(['/products']);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }

  async deleteProduct() {
    if (!this.entity?.id || this.isNew) return;
    if (!confirm('Produkt wirklich löschen? Bestehende Rechnungs-Positionen mit dieser Produkt-ID behalten Name, Preis usw. weiterhin (denormalisiert).')) return;
    await this.repo.delete(this.entity.id);
    this.router.navigate(['/products']);
  }

  async toggleArchive() {
    if (!this.entity?.id || this.isNew) return;
    this.entity.archived = !this.entity.archived;
    this.entity = await this.repo.save(this.entity);
    this.toastr.success(this.entity.archived ? 'Produkt archiviert' : 'Produkt reaktiviert');
    this.router.navigate(['/products']);
  }
}
