import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import {
  TravelExpense,
  travelPurposes,
  calculateAtTravelDefaults,
  TRAVEL_RATES_AT_2026,
} from '../../shared/entities/travel-expense';

@Component({
  selector: 'app-travel-edit',
  imports: [CommonModule, FormsModule, ClarityModule, RouterLink],
  template: `
    <main class="travel-edit" *ngIf="!loading && trip">
      <div class="page-head">
        <div class="page-head-text">
          <h1>{{ isNew ? 'Neue Reise' : 'Reise bearbeiten' }}</h1>
        </div>
        <div class="page-head-actions">
          <button *ngIf="!isNew" class="btn btn-outline btn-warning" type="button" (click)="toggleArchive()">
            {{ trip.archived ? 'Reaktivieren' : 'Archivieren' }}
          </button>
          <button class="btn btn-outline" type="button" (click)="cancel()">Abbrechen</button>
          <button class="btn btn-primary" type="button" (click)="save()" [disabled]="saving">{{ saving ? 'Speichert…' : 'Speichern' }}</button>
        </div>
      </div>

      <form clrForm clrLayout="horizontal" (ngSubmit)="save()">
        <clr-input-container>
          <label>Reiseziel</label>
          <input clrInput name="destination" [(ngModel)]="trip.destination" required />
        </clr-input-container>

        <clr-select-container>
          <label>Zweck</label>
          <select clrSelect name="purpose" [(ngModel)]="trip.purpose">
            <option *ngFor="let p of purposes" [value]="p">{{ p }}</option>
          </select>
        </clr-select-container>

        <clr-date-container>
          <label>Reisebeginn</label>
          <input type="date" clrDate name="startDate" [(ngModel)]="trip.startDate" />
        </clr-date-container>

        <clr-date-container>
          <label>Reiseende</label>
          <input type="date" clrDate name="endDate" [(ngModel)]="trip.endDate" />
        </clr-date-container>

        <clr-number-input-container>
          <label>Reisedauer (Stunden)</label>
          <input clrNumberInput type="number" step="0.5" min="0" name="durationHours" [(ngModel)]="trip.durationHours" (ngModelChange)="recomputePreview()" />
          <clr-control-helper>Diäten Inland ab 3h, je 24h ein voller Tagessatz ({{ fmt(rates.diaetenInlandPerDay) }} €)</clr-control-helper>
        </clr-number-input-container>

        <clr-number-input-container>
          <label>Nächtigungen</label>
          <input clrNumberInput type="number" step="1" min="0" name="nights" [(ngModel)]="trip.nights" (ngModelChange)="recomputePreview()" />
          <clr-control-helper>Pauschal Inland: {{ fmt(rates.nachtigungInlandPauschale) }} €/Nacht (alternativ Belege)</clr-control-helper>
        </clr-number-input-container>

        <clr-number-input-container>
          <label>Gefahrene KM</label>
          <input clrNumberInput type="number" step="0.1" min="0" name="kmDriven" [(ngModel)]="trip.kmDriven" (ngModelChange)="recomputePreview()" />
          <clr-control-helper>KM-Geld 2026: {{ fmt(rates.kmGeldPerKm) }} €/km (+0,05 Mitfahrer)</clr-control-helper>
        </clr-number-input-container>

        <div class="auto-fill">
          <button type="button" class="btn btn-outline btn-sm" (click)="autoFillStandard()">
            ⚙ AT-Standardsätze übernehmen
          </button>
          <span class="auto-fill-info" *ngIf="autoFillPreview as p">
            → Diäten {{ fmt(p.diaetenAuto) }} € · Nächtigung {{ fmt(p.nachtPauschaleAuto) }} € · KM-Geld {{ fmt(p.kmGeldAuto) }} €
          </span>
        </div>

        <h2>Kosten</h2>

        <clr-number-input-container>
          <label>Diäten / Tagessatz (EUR)</label>
          <input clrNumberInput type="number" step="0.01" name="mealsAmount" [(ngModel)]="trip.mealsAmount" />
        </clr-number-input-container>

        <clr-number-input-container>
          <label>Nächtigung (EUR)</label>
          <input clrNumberInput type="number" step="0.01" name="accommodationAmount" [(ngModel)]="trip.accommodationAmount" />
        </clr-number-input-container>

        <clr-number-input-container>
          <label>KM-Geld (EUR)</label>
          <input clrNumberInput type="number" step="0.01" name="kmAmount" [(ngModel)]="trip.kmAmount" />
        </clr-number-input-container>

        <clr-number-input-container>
          <label>Öffentlicher Verkehr / Taxi (EUR)</label>
          <input clrNumberInput type="number" step="0.01" name="publicTransportAmount" [(ngModel)]="trip.publicTransportAmount" />
        </clr-number-input-container>

        <clr-number-input-container>
          <label>Sonstige Kosten (EUR)</label>
          <input clrNumberInput type="number" step="0.01" name="otherCostsAmount" [(ngModel)]="trip.otherCostsAmount" />
        </clr-number-input-container>

        <div class="total-display">
          <strong>Summe:</strong> {{ fmt(trip.totalAmount) }} €
        </div>

        <h2>Sonstiges</h2>

        <clr-textarea-container>
          <label>Bemerkungen</label>
          <textarea clrTextarea name="notes" [(ngModel)]="trip.notes" rows="3"></textarea>
        </clr-textarea-container>

        <clr-input-container>
          <label>Projekt-ID</label>
          <input clrInput name="projectId" [(ngModel)]="trip.projectId" placeholder="optional — für Weiterverrechnung" />
        </clr-input-container>

        <clr-input-container>
          <label>Kunden-ID</label>
          <input clrInput name="customerId" [(ngModel)]="trip.customerId" placeholder="optional" />
        </clr-input-container>

        <button type="submit" hidden></button>
      </form>
    </main>
  `,
  styles: [`
    .travel-edit { max-width: 720px; }
    h2 { font-size: 1rem; margin-top: 1.5rem; color: #4a4a4a; }
    .auto-fill { margin: 0.5rem 0; padding: 0.5rem; background: #fafafa; border-radius: 3px;
      display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;
      .auto-fill-info { font-size: 0.82rem; color: #666; font-variant-numeric: tabular-nums; }
    }
    .total-display { padding: 0.75rem; background: #fafafa; border-left: 3px solid #2f2f2f;
      margin: 1rem 0; font-size: 1.1rem; font-variant-numeric: tabular-nums;
      strong { font-weight: 600; }
    }
  `],
})
export class TravelEditComponent implements OnInit {
  trip?: TravelExpense;
  loading = true;
  saving = false;
  isNew = false;
  purposes = travelPurposes;
  rates = TRAVEL_RATES_AT_2026;
  autoFillPreview: { diaetenAuto: number; nachtPauschaleAuto: number; kmGeldAuto: number } | null = null;

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
      if (!found) { this.router.navigate(['/travel']); return; }
      this.trip = found;
    }
    this.loading = false;
    this.recomputePreview();
  }

  recomputePreview() {
    if (!this.trip) { this.autoFillPreview = null; return; }
    this.autoFillPreview = calculateAtTravelDefaults({
      durationHours: this.trip.durationHours || 0,
      nights: this.trip.nights || 0,
      kmDriven: this.trip.kmDriven || 0,
    });
  }

  autoFillStandard() {
    if (!this.trip) return;
    this.recomputePreview();
    if (!this.autoFillPreview) return;
    this.trip.mealsAmount = this.autoFillPreview.diaetenAuto;
    this.trip.accommodationAmount = this.autoFillPreview.nachtPauschaleAuto;
    this.trip.kmAmount = this.autoFillPreview.kmGeldAuto;
    this.toastr.success('AT-Standardsätze übernommen — bitte prüfen');
  }

  async save() {
    if (!this.trip) return;
    this.saving = true;
    try {
      this.trip = await remult.repo(TravelExpense).save(this.trip);
      this.toastr.success('Reise gespeichert');
      this.router.navigate(['/travel']);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Speichern fehlgeschlagen');
    } finally {
      this.saving = false;
    }
  }

  cancel() { this.router.navigate(['/travel']); }
  async toggleArchive() {
    if (!this.trip) return;
    const willBeArchived = !this.trip.archived;
    this.trip.archived = willBeArchived;
    this.saving = true;
    try {
      this.trip = await remult.repo(TravelExpense).save(this.trip);
      this.toastr.success(willBeArchived ? 'Reise archiviert' : 'Reise reaktiviert');
      this.router.navigate(['/travel']);
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Aktion fehlgeschlagen');
    } finally { this.saving = false; }
  }

  fmt(n: number | undefined): string {
    if (n === undefined || n === null) return '0,00';
    return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
