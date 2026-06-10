import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { Asset, assetCategories, ASSET_GWG_LIMIT } from '../../shared/entities/asset';

@Component({
  selector: 'app-asset-edit',
  imports: [CommonModule, FormsModule, ClarityModule, RouterLink],
  template: `
    <main class="asset-edit" *ngIf="!loading && asset">
      <div class="page-head">
        <div class="page-head-text">
          <h1>{{ isNew ? 'Neues Wirtschaftsgut' : 'Wirtschaftsgut bearbeiten' }}</h1>
        </div>
        <div class="page-head-actions">
          <button *ngIf="!isNew" class="btn btn-outline btn-warning" type="button" (click)="toggleArchive()">
            {{ asset.archived ? 'Reaktivieren' : 'Archivieren' }}
          </button>
          <button class="btn btn-outline" type="button" (click)="cancel()">Abbrechen</button>
          <button class="btn btn-primary" type="button" (click)="save()" [disabled]="saving">{{ saving ? 'Speichert…' : 'Speichern' }}</button>
        </div>
      </div>

      <form clrForm clrLayout="horizontal" (ngSubmit)="save()">
        <clr-input-container>
          <label>Bezeichnung</label>
          <input clrInput name="name" [(ngModel)]="asset.name" required />
        </clr-input-container>

        <clr-select-container>
          <label>Kategorie</label>
          <select clrSelect name="category" [(ngModel)]="asset.category">
            <option *ngFor="let c of categories" [value]="c">{{ c }}</option>
          </select>
        </clr-select-container>

        <clr-date-container>
          <label>Anschaffungsdatum</label>
          <input type="date" clrDate name="acquisitionDate" [(clrDate)]="asset.acquisitionDate" />
        </clr-date-container>

        <clr-number-input-container>
          <label>Anschaffungskosten netto (EUR)</label>
          <input clrNumberInput type="number" step="0.01" name="acquisitionCost" [(ngModel)]="asset.acquisitionCost" (ngModelChange)="onCostChange()" />
          <clr-control-helper>≤ {{ gwgLimit }} € = automatisch GWG (Sofortabschreibung)</clr-control-helper>
        </clr-number-input-container>

        <clr-number-input-container>
          <label>Nutzungsdauer (Jahre)</label>
          <input clrNumberInput type="number" step="1" name="usefulLifeYears" [(ngModel)]="asset.usefulLifeYears" [disabled]="asset.isGwg" />
          <clr-control-helper>3 Computer · 5 Smartphone · 7 Möbel · 8 PKW · 10 Maschinen</clr-control-helper>
        </clr-number-input-container>

        <clr-checkbox-container>
          <clr-checkbox-wrapper>
            <input type="checkbox" clrCheckbox name="isGwg" [(ngModel)]="asset.isGwg" />
            <label>GWG — Sofortabschreibung erzwingen</label>
          </clr-checkbox-wrapper>
        </clr-checkbox-container>

        <h2>Abgang (optional)</h2>

        <clr-date-container>
          <label>Abgangsdatum</label>
          <input type="date" clrDate name="disposalDate" [(ngModel)]="asset.disposalDate" />
        </clr-date-container>

        <clr-number-input-container>
          <label>Erlös aus Abgang (EUR)</label>
          <input clrNumberInput type="number" step="0.01" name="disposalAmount" [(ngModel)]="asset.disposalAmount" />
        </clr-number-input-container>

        <h2>Sonstiges</h2>

        <clr-textarea-container>
          <label>Anmerkungen</label>
          <textarea clrTextarea name="notes" [(ngModel)]="asset.notes" rows="3"></textarea>
        </clr-textarea-container>

        <clr-input-container>
          <label>Beleg (Expense-ID)</label>
          <input clrInput name="sourceExpenseId" [(ngModel)]="asset.sourceExpenseId" placeholder="optional" />
        </clr-input-container>

        <!-- Versteckter Submit-Button: macht Enter-Key auf Inputs zum Save-Trigger,
             damit man nicht zwingend oben rechts hochklicken muss. -->
        <button type="submit" hidden></button>
      </form>
    </main>
  `,
  styles: [`
    .asset-edit { max-width: 720px; }
    h2 { font-size: 1rem; margin-top: 1.5rem; color: var(--clr-color-neutral-700, #4a4a4a); }
  `],
})
export class AssetEditComponent implements OnInit {
  asset?: Asset;
  loading = true;
  saving = false;
  isNew = false;
  categories = assetCategories;
  readonly gwgLimit = ASSET_GWG_LIMIT;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private toastr: ToastrService,
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id === 'new' || !id) {
      this.asset = remult.repo(Asset).create();
      this.asset.acquisitionDate = new Date();
      this.isNew = true;
    } else {
      const found = await remult.repo(Asset).findFirst({ id });
      if (!found) {
        this.router.navigate(['/assets']);
        return;
      }
      this.asset = found;
    }
    this.loading = false;
  }

  onCostChange(): void {
    if (!this.asset) return;
    // Auto-Sync GWG-Flag mit Anschaffungskosten:
    // ≤ Limit → automatisch GWG; > Limit → automatisch nicht-GWG.
    // User kann nach dem Auto-Wert immer noch manuell overriden (Klick aufs
    // Checkbox), aber ein neuer Cost-Change resettet das wieder.
    if (this.asset.acquisitionCost > 0 && this.asset.acquisitionCost <= ASSET_GWG_LIMIT) {
      this.asset.isGwg = true;
    } else if (this.asset.acquisitionCost > ASSET_GWG_LIMIT) {
      this.asset.isGwg = false;
    }
  }

  async save(): Promise<void> {
    if (!this.asset) return;
    this.saving = true;
    try {
      this.asset = await remult.repo(Asset).save(this.asset);
      this.toastr.success('Wirtschaftsgut gespeichert');
      this.router.navigate(['/assets', this.asset.id]);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }

  cancel(): void {
    if (this.isNew) this.router.navigate(['/assets']);
    else this.router.navigate(['/assets', this.asset!.id]);
  }

  async toggleArchive(): Promise<void> {
    if (!this.asset) return;
    const willBeArchived = !this.asset.archived;
    this.asset.archived = willBeArchived;
    this.saving = true;
    try {
      this.asset = await remult.repo(Asset).save(this.asset);
      this.toastr.success(willBeArchived ? 'Wirtschaftsgut archiviert' : 'Wirtschaftsgut reaktiviert');
      this.router.navigate(['/assets']);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Aktion fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }
}
