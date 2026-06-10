import { Routes } from '@angular/router';
import { AuthComponent } from './auth/auth.component';
import { authGuard } from './auth/auth.guard';
import { CrmComponent } from './crm/crm.component';
import { PersonEditComponent } from './crm/person-edit/person-edit.component';
import { PersonViewComponent } from './crm/person-view/person-view.component';
import { CompanyViewComponent } from './crm/company-view/company-view.component';
import { CompanyEditComponent } from './crm/company-edit/company-edit.component';
import { NumberRangesComponent } from './settings/number-ranges.component';
import { CompanySettingsComponent } from './settings/company-settings.component';
import { OmComponent } from './om/om.component';
import { InvoiceEditComponent } from './om/invoice-edit/invoice-edit.component';
import { InvoiceViewComponent } from './om/invoice-view/invoice-view.component';
import { PmComponent } from './pm/pm.component';
import { ProjectViewComponent } from './pm/project-view/project-view.component';
import { ProjectEditComponent } from './pm/project-edit/project-edit.component';
import { TimeEntryEditComponent } from './pm/time-entry-edit/time-entry-edit.component';
import { TimeEntriesOverviewComponent } from './pm/time-entries-overview/time-entries-overview.component';
import { AboutComponent } from './about/about.component';
import { HandbuchComponent } from './handbuch/handbuch.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { ModulesSettingsComponent } from './settings/modules-settings.component';
import { moduleGuard } from './core/module.guard';
import { ChangePasswordComponent } from './auth/change-password.component';
import { ProductsComponent } from './products/products.component';
import { ProductEditComponent } from './products/product-edit/product-edit.component';
import { AuditLogComponent } from './admin/audit-log/audit-log.component';
import { TaxExportComponent } from './admin/tax-export/tax-export.component';
import { UvaComponent } from './at-tax/uva/uva.component';
import { ZmComponent } from './at-tax/zm/zm.component';
import { AssetsComponent } from './assets/assets.component';
import { AssetEditComponent } from './assets/asset-edit.component';
import { AssetViewComponent } from './assets/asset-view.component';
import { TravelComponent } from './travel/travel.component';
import { TravelEditComponent } from './travel/travel-edit.component';
import { CashbookComponent } from './cashbook/cashbook.component';
import { CashbookEditComponent } from './cashbook/cashbook-edit.component';
import { BmdExportComponent } from './at-tax/bmd-export/bmd-export.component';
import { BackupsComponent } from './admin/backups/backups.component';
import { BankAbgleichComponent } from './bank/bank-abgleich/bank-abgleich.component';
import { OffersComponent } from './om/offers/offers.component';
import { OfferEditComponent } from './om/offer-edit/offer-edit.component';
import { AnalyticsComponent } from './analytics/analytics.component';
import { SvsComponent } from './svs/svs.component';
import { EstComponent } from './est/est.component';
import { ExpensesComponent } from './expenses/expenses.component';
import { ExpenseEditComponent } from './expenses/expense-edit/expense-edit.component';
import { RecurringComponent } from './recurring/recurring.component';
import { RecurringEditComponent } from './recurring/recurring-edit/recurring-edit.component';
import { WorkTimeComponent } from './work-time/work-time.component';
import { OnboardingWizardComponent } from './onboarding/onboarding-wizard.component';
import { ChatPageComponent } from './chat/chat-page.component';
import { RemindersComponent } from './reminders/reminders.component';
import { AgentMemoryComponent } from './settings/agent-memory.component';

export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    component: DashboardComponent,
    pathMatch: 'full',
  },
  {
    path: 'crm/overview',
    canActivate: [authGuard],
    component: CrmComponent,
  },
  {
    path: 'crm/person/:id',
    canActivate: [authGuard],
    component: PersonViewComponent,
  },
  {
    path: 'crm/person/:id/edit',
    canActivate: [authGuard],
    component: PersonEditComponent,
  },
  {
    path: 'crm/company/:id',
    canActivate: [authGuard],
    component: CompanyViewComponent,
  },
  {
    path: 'crm/company/:id/edit',
    canActivate: [authGuard],
    component: CompanyEditComponent,
  },

  {
    path: 'om/invoice',
    canActivate: [authGuard],
    component: OmComponent,
  },
  {
    path: 'om/invoice/:id',
    canActivate: [authGuard],
    component: InvoiceViewComponent,
  },
  {
    path: 'om/invoice/:id/edit',
    canActivate: [authGuard],
    component: InvoiceEditComponent,
  },

  {
    path: 'pm/overview',
    canActivate: [authGuard, moduleGuard('projects')],
    component: PmComponent,
  },
  {
    path: 'pm/project/:id',
    canActivate: [authGuard, moduleGuard('projects')],
    component: ProjectViewComponent,
  },
  {
    path: 'pm/project/:id/edit',
    canActivate: [authGuard, moduleGuard('projects')],
    component: ProjectEditComponent,
  },
  {
    path: 'pm/time-entries',
    canActivate: [authGuard, moduleGuard('projects')],
    component: TimeEntriesOverviewComponent,
  },
  {
    path: 'pm/time-entry/:id/edit',
    canActivate: [authGuard, moduleGuard('projects')],
    component: TimeEntryEditComponent,
  },

  {
    path: 'products',
    canActivate: [authGuard, moduleGuard('products')],
    component: ProductsComponent,
  },
  {
    path: 'products/:id/edit',
    canActivate: [authGuard, moduleGuard('products')],
    component: ProductEditComponent,
  },

  {
    path: 'expenses',
    canActivate: [authGuard, moduleGuard('expenses')],
    component: ExpensesComponent,
  },
  {
    path: 'expenses/:id/edit',
    canActivate: [authGuard, moduleGuard('expenses')],
    component: ExpenseEditComponent,
  },

  {
    path: 'recurring',
    canActivate: [authGuard],
    component: RecurringComponent,
  },
  {
    path: 'work-time',
    canActivate: [authGuard, moduleGuard('workHours')],
    component: WorkTimeComponent,
  },
  {
    path: 'recurring/:id/edit',
    canActivate: [authGuard],
    component: RecurringEditComponent,
  },

  {
    path: 'admin/audit-log',
    canActivate: [authGuard],
    component: AuditLogComponent,
  },
  {
    path: 'admin/tax-export',
    canActivate: [authGuard, moduleGuard('taxExport')],
    component: TaxExportComponent,
  },
  {
    path: 'at-tax/uva',
    canActivate: [authGuard, moduleGuard('taxExport')],
    component: UvaComponent,
  },
  {
    path: 'at-tax/zm',
    canActivate: [authGuard, moduleGuard('taxExport')],
    component: ZmComponent,
  },
  {
    path: 'at-tax/bmd-export',
    canActivate: [authGuard, moduleGuard('taxExport')],
    component: BmdExportComponent,
  },
  {
    path: 'admin/backups',
    canActivate: [authGuard],
    component: BackupsComponent,
  },
  {
    path: 'bank/abgleich',
    canActivate: [authGuard],
    component: BankAbgleichComponent,
  },
  {
    path: 'om/offers',
    canActivate: [authGuard],
    component: OffersComponent,
  },
  {
    path: 'om/offer/:id/edit',
    canActivate: [authGuard],
    component: OfferEditComponent,
  },
  {
    path: 'analytics',
    canActivate: [authGuard],
    component: AnalyticsComponent,
  },
  {
    path: 'svs',
    canActivate: [authGuard, moduleGuard('svs')],
    component: SvsComponent,
  },
  {
    path: 'est',
    canActivate: [authGuard, moduleGuard('est')],
    component: EstComponent,
  },
  {
    path: 'assets',
    canActivate: [authGuard, moduleGuard('assets')],
    component: AssetsComponent,
  },
  {
    path: 'assets/:id/edit',
    canActivate: [authGuard, moduleGuard('assets')],
    component: AssetEditComponent,
  },
  {
    path: 'assets/:id',
    canActivate: [authGuard, moduleGuard('assets')],
    component: AssetViewComponent,
  },
  {
    path: 'travel',
    canActivate: [authGuard, moduleGuard('travel')],
    component: TravelComponent,
  },
  {
    path: 'travel/:id/edit',
    canActivate: [authGuard, moduleGuard('travel')],
    component: TravelEditComponent,
  },
  {
    path: 'cashbook',
    canActivate: [authGuard, moduleGuard('cashbook')],
    component: CashbookComponent,
  },
  {
    path: 'cashbook/:id/edit',
    canActivate: [authGuard, moduleGuard('cashbook')],
    component: CashbookEditComponent,
  },

  {
    path: 'settings/number-ranges',
    canActivate: [authGuard],
    component: NumberRangesComponent,
  },
  {
    path: 'settings/company',
    canActivate: [authGuard],
    component: CompanySettingsComponent,
  },
  {
    path: 'settings/module',
    canActivate: [authGuard],
    component: ModulesSettingsComponent,
  },
  {
    path: 'settings/memory',
    canActivate: [authGuard],
    component: AgentMemoryComponent,
  },
  {
    path: 'onboarding',
    canActivate: [authGuard],
    component: OnboardingWizardComponent,
  },
  {
    path: 'about',
    canActivate: [authGuard],
    component: AboutComponent,
  },
  {
    path: 'handbuch',
    canActivate: [authGuard],
    component: HandbuchComponent,
  },
  {
    path: 'chat',
    canActivate: [authGuard, moduleGuard('llm')],
    component: ChatPageComponent,
  },
  {
    path: 'reminders',
    canActivate: [authGuard, moduleGuard('reminder')],
    component: RemindersComponent,
  },
  {
    path: 'change-password',
    canActivate: [authGuard],
    component: ChangePasswordComponent,
  },
  {
    path: 'login',
    component: AuthComponent,
  },
  {
    path: 'm',
    loadChildren: () => import('./m/m.routes').then((m) => m.M_ROUTES),
  },
];
