import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { remult } from 'remult';

export const authGuard: CanActivateFn = (route, state) => {
  if (remult.authenticated()) return true;
  inject(Router).navigate(['/login']);
  return false;
};
