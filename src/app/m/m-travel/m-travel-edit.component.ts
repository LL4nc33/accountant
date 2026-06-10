import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import {
  TravelExpense, travelPurposes, calculateAtTravelDefaults, TRAVEL_RATES_AT_2026,
} from '../../../shared/entities/travel-expense';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

@Component({
  selector: 'm-travel-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MFormSectionComponent],
  templateUrl: './m-travel-edit.component.html',
  styleUrls: ['../m-expenses/m-expense-edit.component.scss'],
})
export class MTravelEditComponent implements OnInit {
  trip?: TravelExpense;
  loading = true;
  saving = false;
  isNew = false;
  purposes = travelPurposes;
  rates = TRAVEL_RATES_AT_2026;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private toastr: ToastrService,
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id === 'new' || !id) {
      this.trip = remult.repo(TravelExpense).create();
      this.trip.startDate = new Date();
      this.isNew = true;
    } else {
      const found = await remult.repo(TravelExpense).findFirst({ id });
      if (!found) { this.router.navigate(['/m/travel']); return; }
      this.trip = found;
    }
    this.loading = false;
  }

  autoFill() {
    if (!this.trip) return;
    const r = calculateAtTravelDefaults({
      durationHours: this.trip.durationHours || 0,
      nights: this.trip.nights || 0,
      kmDriven: this.trip.kmDriven || 0,
    });
    this.trip.mealsAmount = r.diaetenAuto;
    this.trip.accommodationAmount = r.nachtPauschaleAuto;
    this.trip.kmAmount = r.kmGeldAuto;
    // Im Toast die geschriebenen Werte zeigen — User sieht was passiert ist
    // und merkt sofort wenn manuelle Werte überschrieben wurden.
    this.toastr.success(
      `Übernommen: Diäten ${this.fmt(r.diaetenAuto)} €, Nächtigung ${this.fmt(r.nachtPauschaleAuto)} €, KM-Geld ${this.fmt(r.kmGeldAuto)} €`,
      undefined,
      { timeOut: 6000 },
    );
  }

  async save() {
    if (!this.trip) return;
    this.saving = true;
    try {
      this.trip = await remult.repo(TravelExpense).save(this.trip);
      this.toastr.success('Gespeichert');
      this.router.navigate(['/m/travel']);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Fehler');
    } finally { this.saving = false; }
  }

  async toggleArchive() {
    if (!this.trip) return;
    this.trip.archived = !this.trip.archived;
    await this.save();
  }

  fmt(n: number | undefined): string {
    if (n === undefined || n === null) return '0,00';
    return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
