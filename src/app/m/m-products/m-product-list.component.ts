import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { remult } from 'remult';
import { Product } from '../../../shared/entities/product';
import { MCardComponent } from '../m-core/m-card.component';

@Component({
  selector: 'm-product-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MCardComponent],
  template: `
    <div class="m-list-toolbar">
      <input type="search" [(ngModel)]="search" placeholder="Suchen…" class="m-search" />
      <div class="m-pills">
        <button class="m-pill" [class.active]="showArchived" (click)="showArchived = !showArchived; reload()">Archiv</button>
        <a class="m-pill m-pill-add" routerLink="/m/product/new/edit">+ Neues Produkt</a>
      </div>
    </div>
    <p *ngIf="loading" class="m-muted">Lädt …</p>
    <p *ngIf="!loading && filtered.length === 0" class="m-muted">Noch keine Produkte im Katalog.</p>
    <m-card *ngFor="let p of filtered" [link]="['/m/product', p.id, 'edit']">
      <div card-head>
        <span>{{ p.name }}</span>
        <span>{{ p.defaultPrice | number:'1.2-2':'de-AT' }} €</span>
      </div>
      <div card-body>
        <span>{{ p.unit }} · {{ p.defaultVat }}% USt</span>
      </div>
      <div card-status>
        <span *ngIf="p.archived" class="m-badge m-badge-warning">Archiviert</span>
      </div>
    </m-card>
  `,
  styleUrls: ['../m-crm/m-customer-list.component.scss'],
})
export class MProductListComponent implements OnInit {
  loading = true;
  showArchived = false;
  search = '';
  rows: Product[] = [];

  async ngOnInit() { await this.reload(); }

  async reload() {
    this.loading = true;
    const where = this.showArchived ? {} : { archived: false };
    this.rows = await remult.repo(Product).find({ where, orderBy: { name: 'asc' } });
    this.loading = false;
  }

  get filtered(): Product[] {
    if (!this.search.trim()) return this.rows;
    const s = this.search.toLowerCase();
    return this.rows.filter((p) =>
      (p.name || '').toLowerCase().includes(s) || (p.description || '').toLowerCase().includes(s),
    );
  }
}
