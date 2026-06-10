/**
 * SVS-Vorschau-Endpoint (Phase 30, v0.32.0)
 *
 * Liefert AT-Sozialversicherungs-Forecast für ein Beitragsjahr.
 * Aggregiert Rechnungen + Ausgaben des Jahres (Netto-Basis), übergibt
 * an den shared SVS-Kernel und reichert um Quartalstermine,
 * Versicherungsgrenze-Check und Nachbemessungs-Schätzung an.
 *
 * Lese-Operation, admin-only. Kein Caching — wenige tausend Rows sind
 * schnell genug.
 */
import express from 'express';
import { repo, type UserInfo } from 'remult';
import { api } from './api';
import { CompanySettings } from '../shared/entities/company-settings';
import {
  calculateSvs,
  estimateNachbemessung,
  svsQuarters,
  svsVersicherungsgrenzeEligible,
} from '../shared/lib/svs';
import { aggregateProfitYear } from './profit-aggregator';

export const svs = express.Router();
svs.use(express.json());
svs.use(api.withRemult);

function requireAdmin(req: express.Request, res: express.Response): UserInfo | null {
  const u = (req.session as any)?.['user'] as UserInfo | undefined;
  if (!u) {
    res.status(401).json({ error: 'Nicht eingeloggt' });
    return null;
  }
  if (!u.roles?.includes('admin')) {
    res.status(403).json({ error: 'Admin-Recht erforderlich' });
    return null;
  }
  return u;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}


svs.get('/api/svs', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const year = parseInt(String(req.query['year'] ?? new Date().getFullYear()), 10);
  if (isNaN(year) || year < 2000 || year > 2099) {
    res.status(400).json({ error: 'Ungültiges Jahr' });
    return;
  }

  try {
    const settings = await repo(CompanySettings).findFirst();
    const svsStartYear = settings?.svsStartYear && settings.svsStartYear > 1900
      ? settings.svsStartYear
      : year; // Fallback: aktuelles Jahr = Jahr 1
    const yearsAsSelfEmployed = Math.max(1, year - svsStartYear + 1);

    const profitAgg = await aggregateProfitYear(year);
    const svsResult = calculateSvs(profitAgg.annualProfit, yearsAsSelfEmployed);
    const quarters = svsQuarters(year, svsResult.total);

    // Nachbemessungs-Hinweis: nur sinnvoll wenn currentYear ≥ svsStartYear + 2
    // (= die Endabrechnung für Jahr 1/2 kommt rückwirkend in Jahr 3+).
    let rueckstellung: { expectedNachzahlung: number; explanation: string } | undefined;
    if (yearsAsSelfEmployed >= 3) {
      const nb = estimateNachbemessung(profitAgg.annualProfit);
      if (nb > 0) {
        rueckstellung = {
          expectedNachzahlung: nb,
          explanation:
            `Geschätzte Nachbemessung für Jahr 1 (basierend auf aktuellem Gewinn ` +
            `${profitAgg.annualProfit.toLocaleString('de-AT')} €). Die SVS schreibt ` +
            `den Differenzbetrag im Folgejahr in 4 Quartalsraten vor — als ` +
            `Gründer-Sonderregel auf bis zu 12 Quartale streckbar.`,
        };
      }
    }

    const versicherungsgrenze = svsVersicherungsgrenzeEligible(
      profitAgg.annualProfit,
      profitAgg.annualRevenueGross,
    );

    res.json({
      year,
      svsStartYear,
      yearsAsSelfEmployed,
      annualRevenueNet: profitAgg.annualRevenueNet,
      annualRevenueGross: profitAgg.annualRevenueGross,
      annualExpenseNet: profitAgg.annualExpenseNet,
      annualProfit: profitAgg.annualProfit,
      invoiceCount: profitAgg.invoiceCount,
      expenseCount: profitAgg.expenseCount,
      svs: svsResult,
      quarters,
      rueckstellung,
      versicherungsgrenze,
    });
  } catch (e: any) {
    console.error('[svs] aggregate failed', e);
    res.status(500).json({ error: e?.message ?? 'SVS-Aggregation fehlgeschlagen' });
  }
});
