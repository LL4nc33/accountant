import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ClarityModule, ClrDatagridModule } from '@clr/angular';
import { remult } from 'remult';
import { Product } from '../../shared/entities/product';
import { EmptyStateComponent } from '../core/empty-state/empty-state.component';
import { archiveScope } from '../core/archive-filter';

@Component({
  selector: 'app-products',
  imports: [CommonModule, FormsModule, ClarityModule, ClrDatagridModule, RouterLink, EmptyStateComponent],
  // FormsModule registered for ngModel two-way binding on the showArchived checkbox.
  templateUrl: './products.component.html',
  styleUrl: './products.component.scss',
})
export class ProductsComponent implements OnInit {
  repo = remult.repo(Product);
  rows: Product[] = [];
  loading = true;
  showArchived = false;

  constructor(private router: Router) {}

  async ngOnInit() { await this.reload(); }

  async reload() {
    this.loading = true;
    try {
      this.rows = await this.repo.find({
        where: archiveScope(this.showArchived),
        orderBy: { name: 'asc' },
      });
    } finally {
      this.loading = false;
    }
  }

  open(p: Product) {
    this.router.navigateByUrl(`/products/${p.id}/edit`);
  }
}
