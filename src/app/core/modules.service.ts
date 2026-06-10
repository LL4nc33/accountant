import { Injectable } from '@angular/core';
import { BehaviorSubject, map, Observable } from 'rxjs';
import { remult } from 'remult';
import { CompanySettings } from '../../shared/entities/company-settings';

export type ModuleId =
  | 'projects'
  | 'products'
  | 'expenses'
  | 'workHours'
  | 'taxExport'
  | 'llm'
  | 'reminder'
  | 'svs'
  | 'est'
  | 'assets'
  | 'travel'
  | 'cashbook';

type ModuleField =
  | 'moduleProjects'
  | 'moduleProducts'
  | 'moduleExpenses'
  | 'moduleWorkHours'
  | 'moduleTaxExport'
  | 'moduleLlm'
  | 'moduleReminder'
  | 'moduleSvs'
  | 'moduleEst'
  | 'moduleAssets'
  | 'moduleTravel'
  | 'moduleCashbook';

const MODULE_FIELD: Record<ModuleId, ModuleField> = {
  projects: 'moduleProjects',
  products: 'moduleProducts',
  expenses: 'moduleExpenses',
  workHours: 'moduleWorkHours',
  taxExport: 'moduleTaxExport',
  llm: 'moduleLlm',
  reminder: 'moduleReminder',
  svs: 'moduleSvs',
  est: 'moduleEst',
  assets: 'moduleAssets',
  travel: 'moduleTravel',
  cashbook: 'moduleCashbook',
};

@Injectable({ providedIn: 'root' })
export class ModulesService {
  private settings$ = new BehaviorSubject<CompanySettings | null>(null);

  readonly projects$ = this.observe('projects');
  readonly products$ = this.observe('products');
  readonly expenses$ = this.observe('expenses');
  readonly workHours$ = this.observe('workHours');
  readonly taxExport$ = this.observe('taxExport');
  readonly llm$ = this.observe('llm');
  readonly reminder$ = this.observe('reminder');
  readonly svs$ = this.observe('svs');
  readonly est$ = this.observe('est');
  readonly assets$ = this.observe('assets');
  readonly travel$ = this.observe('travel');
  readonly cashbook$ = this.observe('cashbook');

  private observe(moduleId: ModuleId): Observable<boolean> {
    return this.settings$.pipe(map((s) => this.read(s, moduleId)));
  }

  private read(s: CompanySettings | null, moduleId: ModuleId): boolean {
    if (!s) {
      // Defaults vor Load: Projekte sichtbar (Bestand), Rest aus.
      return moduleId === 'projects';
    }
    const v = s[MODULE_FIELD[moduleId]];
    // Legacy-Fallback: Bestands-JSON ohne Modul-Felder → Projekte default an,
    // andere default aus. So funktioniert UI auch wenn Bootstrap-Migration
    // (warum auch immer) nicht eingegriffen hat.
    if (v === undefined || v === null) return moduleId === 'projects';
    return v === true;
  }

  async load(): Promise<void> {
    try {
      const s = await remult.repo(CompanySettings).findFirst();
      this.settings$.next(s ?? null);
    } catch {
      // Bei Auth-Fehler oder Netzwerk silent — Defaults greifen.
      this.settings$.next(null);
    }
  }

  // Sync-Snapshot für Route-Guard (kein Observable nötig)
  isEnabled(moduleId: ModuleId): boolean {
    return this.read(this.settings$.value, moduleId);
  }

  // Lokales Update — Settings-Seite ruft das nach Save auf,
  // damit Sidebar reaktiv ohne Reload aktualisiert.
  updateLocal(s: CompanySettings): void {
    this.settings$.next(s);
  }
}
