import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ClarityModule } from '@clr/angular';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { remult } from 'remult';
import { Asset, calculateAssetDepreciation, AssetDepreciationPlan } from '../../shared/entities/asset';

@Component({
  selector: 'app-asset-view',
  imports: [CommonModule, ClarityModule, RouterLink],
  template: `
    <main class="asset-view" *ngIf="asset && plan">
      <div class="page-head">
        <div class="page-head-text">
          <h1>{{ asset.name }} <span class="badge gwg" *ngIf="plan.isGwg">GWG</span></h1>
          <p class="head-meta">
            {{ asset.category }} ·
            Anschaffung {{ asset.acquisitionDate | date:'dd.MM.yyyy' }} ·
            AK netto {{ fmt(asset.acquisitionCost) }} €<ng-container *ngIf="!plan.isGwg"> · {{ asset.usefulLifeYears }} Jahre Nutzungsdauer</ng-container>
          </p>
        </div>
        <div class="page-head-actions">
          <a [routerLink]="['/assets', asset.id, 'edit']" class="btn btn-primary">Bearbeiten</a>
        </div>
      </div>

      <section class="card">
        <h2>AfA-Plan</h2>
        <p class="muted" *ngIf="plan.isGwg">Geringwertiges Wirtschaftsgut: Sofortabschreibung im Anschaffungsjahr.</p>
        <p class="muted" *ngIf="!plan.isGwg && halfYearRule()">Halbjahresregel §7 Abs. 2 EStG: halbe Jahres-AfA im Anschaffungs- und im letzten Jahr.</p>
        <table class="schedule">
          <thead>
            <tr>
              <th>Jahr</th>
              <th class="right">AfA</th>
              <th class="right">Restbuchwert Jahresende</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let s of plan.schedule" [class.current]="s.year === currentYear">
              <td>{{ s.year }}</td>
              <td class="right">{{ fmt(s.afa) }} €</td>
              <td class="right">{{ fmt(s.bookValue) }} €</td>
            </tr>
            <tr class="total">
              <td>Summe</td>
              <td class="right">{{ fmt(plan.totalDepreciation) }} €</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="card" *ngIf="asset.disposalDate">
        <h2>Abgang</h2>
        <dl>
          <dt>Abgangsdatum</dt><dd>{{ asset.disposalDate | date:'dd.MM.yyyy' }}</dd>
          <dt>Erlös</dt><dd>{{ fmt(asset.disposalAmount) }} €</dd>
        </dl>
      </section>

      <section class="card" *ngIf="asset.notes">
        <h2>Anmerkungen</h2>
        <p style="white-space: pre-wrap">{{ asset.notes }}</p>
      </section>
    </main>
  `,
  styles: [`
    .asset-view { max-width: 800px; }
    .head-meta { color: var(--clr-color-neutral-700, #4a4a4a); font-size: 0.9rem; margin: 0.35rem 0 0; }
    .badge.gwg { display: inline-block; margin-left: 0.5rem; padding: 0.2rem 0.5rem; border-radius: 3px; font-size: 0.75rem; font-weight: 600; background: #fcecbc; color: #7d5100; text-transform: uppercase; letter-spacing: 0.04em; vertical-align: middle; }
    .card {
      background: white;
      border: 1px solid var(--clr-color-neutral-300, #e0e0e0);
      border-radius: 4px;
      padding: 1rem 1.25rem;
      margin-bottom: 1rem;

      h2 { font-size: 1rem; margin: 0 0 0.5rem; font-weight: 600; }
      p.muted { margin: 0 0 0.75rem; color: var(--clr-color-neutral-600, #666); font-size: 0.85rem; }
    }
    .schedule { width: 100%; border-collapse: collapse; font-size: 0.92rem;
      th, td { padding: 0.45rem 0.75rem; border-bottom: 1px solid var(--clr-color-neutral-200, #f0f0f0); text-align: left; }
      th { font-weight: 500; background: var(--clr-color-neutral-100, #fafafa); color: var(--clr-color-neutral-700, #4a4a4a); }
      .right { text-align: right; font-variant-numeric: tabular-nums; }
      tr.current td { background: var(--clr-color-action-50, #e8f1fa); font-weight: 500; }
      tr.total td { font-weight: 700; border-top: 2px solid var(--clr-color-neutral-400, #ccc); padding-top: 0.6rem; }
    }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.4rem 1rem; font-size: 0.92rem; }
    dt { color: var(--clr-color-neutral-700, #4a4a4a); }
    dd { margin: 0; }
  `],
})
export class AssetViewComponent implements OnInit {
  asset?: Asset;
  plan?: AssetDepreciationPlan;
  currentYear = new Date().getFullYear();

  constructor(private route: ActivatedRoute, private router: Router) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.router.navigate(['/assets']); return; }
    const found = await remult.repo(Asset).findFirst({ id });
    if (!found) { this.router.navigate(['/assets']); return; }
    this.asset = found;
    this.plan = calculateAssetDepreciation(found);
  }

  halfYearRule(): boolean {
    return new Date(this.asset!.acquisitionDate).getMonth() >= 6;
  }

  fmt(n: number | undefined): string {
    if (n === undefined || n === null) return '0,00';
    return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
