import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { remult } from 'remult';
import { Asset, calculateAssetDepreciation, assetAfaForYear } from '../../../shared/entities/asset';
import { MCardComponent } from '../m-core/m-card.component';

@Component({
  selector: 'm-assets',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MCardComponent],
  template: `
    <div class="head">
      <h2>Anlagen</h2>
      <a class="m-pill m-pill-primary" routerLink="/m/assets/new/edit">+ Neu</a>
    </div>

    <p *ngIf="loading" class="muted">Lädt…</p>

    <p class="summary" *ngIf="!loading && assets.length">
      AfA {{ currentYear }}: <strong>{{ fmt(totalAfa()) }} €</strong> ·
      Buchwert: <strong>{{ fmt(totalBookValue()) }} €</strong>
    </p>

    <m-card *ngFor="let a of assets" (click)="open(a)" style="cursor:pointer">
      <div card-head>
        <span>{{ a.name }} <span class="badge gwg" *ngIf="isGwg(a)">GWG</span></span>
        <span>{{ fmt(bookValue(a)) }} €</span>
      </div>
      <div card-body>
        <span>{{ a.acquisitionDate | date:'dd.MM.yyyy' }} · AK {{ fmt(a.acquisitionCost) }} €</span>
        <span>AfA {{ currentYear }}: {{ fmt(afa(a)) }} €</span>
      </div>
    </m-card>

    <p *ngIf="!loading && !assets.length" class="muted">
      Noch keine Wirtschaftsgüter. <a routerLink="/m/assets/new/edit">Anlegen →</a>
    </p>
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;
      h2 { margin: 0; font-size: 1.1rem; }
      .m-pill { padding: 0.4rem 0.9rem; background: #1A1A1A; color: white; border-radius: 999px; text-decoration: none; font-size: 0.88rem; }
    }
    .summary { font-size: 0.9rem; margin: 0.5rem 0 1rem;
      strong { font-variant-numeric: tabular-nums; }
    }
    .badge.gwg { display: inline-block; margin-left: 0.4rem; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.7rem; background: #fcecbc; color: #7d5100; font-weight: 600; text-transform: uppercase; }
    .muted { color: #666; }
  `],
})
export class MAssetsComponent implements OnInit {
  assets: Asset[] = [];
  loading = true;
  currentYear = new Date().getFullYear();

  constructor(private router: Router) {}

  async ngOnInit() {
    this.assets = await remult.repo(Asset).find({
      where: { archived: false },
      orderBy: { acquisitionDate: 'desc' as any },
    });
    this.loading = false;
  }

  open(a: Asset) {
    this.router.navigate(['/m/assets', a.id, 'edit']);
  }

  bookValue(a: Asset): number {
    const plan = calculateAssetDepreciation(a);
    const last = plan.schedule.filter(s => s.year <= this.currentYear).pop();
    return last?.bookValue ?? a.acquisitionCost;
  }

  afa(a: Asset): number { return assetAfaForYear(a, this.currentYear); }
  isGwg(a: Asset): boolean { return a.isGwg || a.acquisitionCost <= 1000; }
  totalAfa(): number { return Math.round(this.assets.reduce((s, a) => s + this.afa(a), 0) * 100) / 100; }
  totalBookValue(): number { return Math.round(this.assets.reduce((s, a) => s + this.bookValue(a), 0) * 100) / 100; }

  fmt(n: number | undefined): string {
    if (n === undefined || n === null) return '0,00';
    return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
