import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { Asset, assetCategories, ASSET_GWG_LIMIT, calculateAssetDepreciation } from '../../../shared/entities/asset';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

@Component({
  selector: 'm-asset-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MFormSectionComponent],
  templateUrl: './m-asset-edit.component.html',
  styleUrls: ['../m-expenses/m-expense-edit.component.scss'],
})
export class MAssetEditComponent implements OnInit {
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
      if (!found) { this.router.navigate(['/m/assets']); return; }
      this.asset = found;
    }
    this.loading = false;
  }

  onCostChange(): void {
    if (!this.asset) return;
    if (this.asset.acquisitionCost > 0 && this.asset.acquisitionCost <= ASSET_GWG_LIMIT) {
      this.asset.isGwg = true;
    } else if (this.asset.acquisitionCost > ASSET_GWG_LIMIT) {
      this.asset.isGwg = false;
    }
  }

  get planTotal(): number {
    if (!this.asset) return 0;
    return calculateAssetDepreciation(this.asset).totalDepreciation;
  }

  async save() {
    if (!this.asset) return;
    this.saving = true;
    try {
      this.asset = await remult.repo(Asset).save(this.asset);
      this.toastr.success('Gespeichert');
      this.router.navigate(['/m/assets']);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Fehler');
    } finally { this.saving = false; }
  }

  async toggleArchive() {
    if (!this.asset) return;
    const willBeArchived = !this.asset.archived;
    this.asset.archived = willBeArchived;
    this.saving = true;
    try {
      this.asset = await remult.repo(Asset).save(this.asset);
      this.toastr.success(willBeArchived ? 'Archiviert' : 'Reaktiviert');
      this.router.navigate(['/m/assets']);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Fehler');
    } finally { this.saving = false; }
  }
}
