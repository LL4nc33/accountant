/**
 * ESt-Vorschau-Endpoint (Phase 31, v0.33.0)
 *
 * Liefert AT-Einkommensteuer-Forecast für ein Jahr.
 * Verkettet wenn moduleSvs aktiv: SVS wird vorab berechnet und als
 * Betriebsausgabe abgezogen, bevor die ESt-Berechnung läuft.
 *
 * Lese-Operation, admin-only.
 */
import express from 'express';
import { type UserInfo } from 'remult';
import { repo } from 'remult';
import { api } from './api';
import { CompanySettings } from '../shared/entities/company-settings';
import { calculateEst } from '../shared/lib/est';
import { calculateSvs } from '../shared/lib/svs';
import { aggregateProfitYear } from './profit-aggregator';

export const est = express.Router();
est.use(express.json());
est.use(api.withRemult);

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

est.get('/api/est', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const year = parseInt(String(req.query['year'] ?? new Date().getFullYear()), 10);
  if (isNaN(year) || year < 2000 || year > 2099) {
    res.status(400).json({ error: 'Ungültiges Jahr' });
    return;
  }
  const applyInvestitionsbedingtGfb = req.query['investGfb'] === 'true';

  try {
    const settings = await repo(CompanySettings).findFirst();
    const profitAgg = await aggregateProfitYear(year);

    // SVS-Kopplung: wenn moduleSvs aktiv, berechne SVS und ziehe als BA ab.
    let svsAnnual = 0;
    let svsCoupled = false;
    if (settings?.moduleSvs) {
      const svsStartYear = settings.svsStartYear && settings.svsStartYear > 1900
        ? settings.svsStartYear
        : year;
      const yearsAsSelfEmployed = Math.max(1, year - svsStartYear + 1);
      const svsResult = calculateSvs(profitAgg.annualProfit, yearsAsSelfEmployed);
      svsAnnual = svsResult.total;
      svsCoupled = true;
    }

    const estResult = calculateEst(profitAgg.annualProfit, {
      svsAnnual,
      applyInvestitionsbedingtGfb,
    });

    res.json({
      year,
      annualRevenueNet: profitAgg.annualRevenueNet,
      annualExpenseNet: profitAgg.annualExpenseNet,
      annualProfit: profitAgg.annualProfit,
      invoiceCount: profitAgg.invoiceCount,
      expenseCount: profitAgg.expenseCount,
      svsCoupled,
      applyInvestitionsbedingtGfb,
      est: estResult,
    });
  } catch (e: any) {
    console.error('[est] aggregate failed', e);
    res.status(500).json({ error: e?.message ?? 'ESt-Aggregation fehlgeschlagen' });
  }
});
