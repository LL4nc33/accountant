import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { RouterLink } from '@angular/router';
import { remult } from 'remult';
import { Asset, calculateAssetDepreciation, assetAfaForYear } from '../../shared/entities/asset';

@Component({
  selector: 'app-assets',
  imports: [CommonModule, FormsModule, ClarityModule, RouterLink],
  templateUrl: './assets.component.html',
  styleUrl: './assets.component.scss',
})
export class AssetsComponent implements OnInit {
  assets: Asset[] = [];
  loading = true;
  currentYear = new Date().getFullYear();
  showArchived = false;

  async ngOnInit() {
    await this.refresh();
  }

  async refresh() {
    this.loading = true;
    this.assets = await remult.repo(Asset).find({
      where: this.showArchived ? {} : { archived: false },
      orderBy: { acquisitionDate: 'desc' as any },
    });
    this.loading = false;
  }

  bookValue(a: Asset): number {
    const plan = calculateAssetDepreciation(a);
    const lastBefore = plan.schedule.filter(s => s.year <= this.currentYear).pop();
    if (!lastBefore) return a.acquisitionCost;
    return lastBefore.bookValue;
  }

  afaCurrentYear(a: Asset): number {
    return assetAfaForYear(a, this.currentYear);
  }

  isFullyDepreciated(a: Asset): boolean {
    const plan = calculateAssetDepreciation(a);
    return plan.fullyDepreciatedYear !== null && plan.fullyDepreciatedYear < this.currentYear;
  }

  totalAfaCurrentYear(): number {
    return Math.round(this.assets.reduce((s, a) => s + this.afaCurrentYear(a), 0) * 100) / 100;
  }

  totalBookValue(): number {
    return Math.round(this.assets.reduce((s, a) => s + this.bookValue(a), 0) * 100) / 100;
  }

  fmt(n: number | undefined): string {
    if (n === undefined || n === null) return '0,00';
    return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
