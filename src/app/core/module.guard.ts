import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { ModulesService, ModuleId } from './modules.service';

/**
 * Verhindert Aufruf einer Route, wenn das zugehörige Modul deaktiviert ist.
 * Zeigt Toast + redirected auf Dashboard. Daten der Module bleiben unangetastet,
 * Reaktivierung in /settings/module macht alles sofort wieder sichtbar.
 */
export function moduleGuard(moduleId: ModuleId): CanActivateFn {
  return () => {
    const modules = inject(ModulesService);
    const router = inject(Router);
    const toastr = inject(ToastrService);

    if (modules.isEnabled(moduleId)) return true;

    toastr.warning(
      'Dieses Modul ist deaktiviert. Du kannst es unter Einstellungen → Module aktivieren.',
      'Modul nicht verfügbar',
    );
    router.navigateByUrl('/');
    return false;
  };
}
