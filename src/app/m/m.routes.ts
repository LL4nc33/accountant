import { Routes } from '@angular/router';
import { authGuard } from '../auth/auth.guard';
import { MShellComponent } from './m-shell/m-shell.component';
import { MDashboardComponent } from './m-dashboard/m-dashboard.component';
import { MAnalyticsComponent } from './m-dashboard/m-analytics.component';
import { MSvsComponent } from './m-svs/m-svs.component';
import { MEstComponent } from './m-est/m-est.component';
import { MAssetsComponent } from './m-assets/m-assets.component';
import { MAssetEditComponent } from './m-assets/m-asset-edit.component';
import { MTravelComponent } from './m-travel/m-travel.component';
import { MTravelEditComponent } from './m-travel/m-travel-edit.component';
import { MCashbookComponent } from './m-cashbook/m-cashbook.component';
import { MCashbookEditComponent } from './m-cashbook/m-cashbook-edit.component';
import { moduleGuard } from '../core/module.guard';
import { MStubComponent } from './m-core/m-stub.component';
import { MCustomerListComponent } from './m-crm/m-customer-list.component';
import { MCustomerViewComponent } from './m-crm/m-customer-view.component';
import { MPersonEditComponent } from './m-crm/m-person-edit.component';
import { MCompanyEditComponent } from './m-crm/m-company-edit.component';
import { MCustomerEditComponent } from './m-crm/m-customer-edit.component';
import { MInvoiceListComponent } from './m-om/m-invoice-list.component';
import { MInvoiceViewComponent } from './m-om/m-invoice-view.component';
import { MInvoiceEditComponent } from './m-om/m-invoice-edit.component';
import { MExpenseListComponent } from './m-expenses/m-expense-list.component';
import { MExpenseEditComponent } from './m-expenses/m-expense-edit.component';
import { MProjectListComponent } from './m-pm/m-project-list.component';
import { MProjectViewComponent } from './m-pm/m-project-view.component';
import { MProjectEditComponent } from './m-pm/m-project-edit.component';
import { MTimeEntryEditComponent } from './m-pm/m-time-entry-edit.component';
import { MTimeEntriesListComponent } from './m-pm/m-time-entries-list.component';
import { MWorkTimeComponent } from './m-pm/m-work-time.component';
import { MRecurringListComponent } from './m-om/m-recurring-list.component';
import { MRemindersListComponent } from './m-om/m-reminders-list.component';
import { MOffersListComponent } from './m-om/m-offers-list.component';
import { MChangePasswordComponent } from './m-auth/m-change-password.component';
import { MProductListComponent } from './m-products/m-product-list.component';
import { MProductEditComponent } from './m-products/m-product-edit.component';
import { MAuditLogComponent } from './m-admin/m-audit-log.component';
import { MTaxExportComponent } from './m-admin/m-tax-export.component';
import { MUvaComponent } from './m-admin/m-uva.component';
import { MZmComponent } from './m-at-tax/m-zm.component';
import { MBmdExportComponent } from './m-admin/m-bmd-export.component';
import { MBackupsComponent } from './m-admin/m-backups.component';
import { MBankAbgleichComponent } from './m-bank/m-bank-abgleich.component';
import { MCompanySettingsComponent } from './m-settings/m-company-settings.component';
import { MModulesSettingsComponent } from './m-settings/m-modules-settings.component';
import { MNumberRangesComponent } from './m-settings/m-number-ranges.component';
import { MAboutComponent } from './m-misc/m-about.component';
import { MOnboardingComponent } from './m-misc/m-onboarding.component';
import { MChatComponent } from './m-chat/m-chat.component';

/**
 * Mobile-UI Routes. Lazy-loaded — wird erst geladen wenn auf /m/* navigiert wird.
 * Nicht-fertige Pages rendern MStubComponent mit Link zur Desktop-Variante.
 */
function stub(title: string, pageName: string, desktopLink: string) {
  return { component: MStubComponent, data: { title, pageName, desktopLink } };
}

export const M_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    component: MShellComponent,
    children: [
      { path: '', component: MDashboardComponent, data: { title: 'Dashboard' } },
      { path: 'analytics', component: MAnalyticsComponent, data: { title: 'Analyse' } },
      { path: 'svs', canActivate: [moduleGuard('svs')], component: MSvsComponent, data: { title: 'SVS-Vorschau' } },
      { path: 'est', canActivate: [moduleGuard('est')], component: MEstComponent, data: { title: 'ESt-Vorschau' } },
      { path: 'assets', canActivate: [moduleGuard('assets')], component: MAssetsComponent, data: { title: 'Anlagen' } },
      { path: 'assets/:id/edit', canActivate: [moduleGuard('assets')], component: MAssetEditComponent, data: { title: 'Anlage bearbeiten' } },
      { path: 'travel', canActivate: [moduleGuard('travel')], component: MTravelComponent, data: { title: 'Reisekosten' } },
      { path: 'travel/:id/edit', canActivate: [moduleGuard('travel')], component: MTravelEditComponent, data: { title: 'Reise bearbeiten' } },
      { path: 'cashbook', canActivate: [moduleGuard('cashbook')], component: MCashbookComponent, data: { title: 'Kassabuch' } },
      { path: 'cashbook/:id/edit', canActivate: [moduleGuard('cashbook')], component: MCashbookEditComponent, data: { title: 'Kassabuch-Eintrag' } },

      // CRM
      { path: 'customers', component: MCustomerListComponent, data: { title: 'Kunden' } },
      { path: 'customer/new-person/edit', component: MPersonEditComponent, data: { title: 'Neue Person' } },
      { path: 'customer/new-company/edit', component: MCompanyEditComponent, data: { title: 'Neue Firma' } },
      { path: 'customer/:id', component: MCustomerViewComponent, data: { title: 'Kunde' } },
      { path: 'customer/:id/edit', component: MCustomerEditComponent, data: { title: 'Kunde bearbeiten' } },

      // Invoices
      { path: 'invoices', component: MInvoiceListComponent, data: { title: 'Rechnungen' } },
      { path: 'invoice/:id', component: MInvoiceViewComponent, data: { title: 'Rechnung' } },
      { path: 'invoice/:id/edit', component: MInvoiceEditComponent, data: { title: 'Rechnung bearbeiten' } },
      { path: 'recurring', component: MRecurringListComponent, data: { title: 'Wiederkehrend' } },
      { path: 'reminders', component: MRemindersListComponent, data: { title: 'Mahnungen' } },
      { path: 'offers', component: MOffersListComponent, data: { title: 'Angebote' } },

      // Projects
      { path: 'projects', component: MProjectListComponent, data: { title: 'Projekte' } },
      { path: 'project/:id', component: MProjectViewComponent, data: { title: 'Projekt' } },
      { path: 'project/:id/edit', component: MProjectEditComponent, data: { title: 'Projekt bearbeiten' } },
      { path: 'time-entries', component: MTimeEntriesListComponent, data: { title: 'Zeitbuchungen' } },
      { path: 'time-entry/:id/edit', component: MTimeEntryEditComponent, data: { title: 'Zeitbuchung bearbeiten' } },
      { path: 'work-time', component: MWorkTimeComponent, data: { title: 'Arbeitszeit' } },

      // Products
      { path: 'products', component: MProductListComponent, data: { title: 'Produkte' } },
      { path: 'product/:id/edit', component: MProductEditComponent, data: { title: 'Produkt bearbeiten' } },

      // Expenses
      { path: 'expenses', component: MExpenseListComponent, data: { title: 'Ausgaben' } },
      { path: 'expense/:id/edit', component: MExpenseEditComponent, data: { title: 'Ausgabe bearbeiten' } },

      // Admin
      { path: 'admin/audit-log', component: MAuditLogComponent, data: { title: 'Audit-Log' } },
      { path: 'admin/tax-export', component: MTaxExportComponent, data: { title: 'Finanzamt-Export' } },
      { path: 'at-tax/uva', component: MUvaComponent, data: { title: 'USt-Voranmeldung' } },
      { path: 'at-tax/zm', canActivate: [moduleGuard('taxExport')], component: MZmComponent, data: { title: 'ZM' } },
      { path: 'at-tax/bmd-export', component: MBmdExportComponent, data: { title: 'BMD / RZL-Export' } },
      { path: 'admin/backups', component: MBackupsComponent, data: { title: 'Backups' } },
      { path: 'bank/abgleich', component: MBankAbgleichComponent, data: { title: 'Bank-Abgleich' } },

      // Settings
      { path: 'settings/company', component: MCompanySettingsComponent, data: { title: 'Firma' } },
      { path: 'settings/module', component: MModulesSettingsComponent, data: { title: 'Module' } },
      { path: 'settings/number-ranges', component: MNumberRangesComponent, data: { title: 'Nummernkreise' } },

      // Misc
      { path: 'onboarding', component: MOnboardingComponent, data: { title: 'Setup' } },
      { path: 'change-password', component: MChangePasswordComponent, data: { title: 'Passwort ändern' } },
      { path: 'about', component: MAboutComponent, data: { title: 'Über' } },
      { path: 'chat', component: MChatComponent, data: { title: 'KI-Assistent' } },
    ],
  },
];
