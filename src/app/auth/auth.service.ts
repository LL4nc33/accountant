import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { UserInfo, remult } from 'remult';
import { Subject, firstValueFrom } from 'rxjs';
import { ErrorService } from '../error.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  user: Subject<UserInfo> = new Subject<UserInfo>();

  remult = remult;

  constructor(
    private http: HttpClient,
    protected router: Router,
    protected errorService: ErrorService
  ) {}

  async logIn(username: string, password: string) {
    try {
      this.errorService.loginError = false;
      const userInfo = await firstValueFrom(
        this.http.post<UserInfo & { usedDefaultPassword?: boolean }>(
          '/api/login',
          { name: username, password },
        ),
      );
      if (userInfo) {
        this.remult.user = userInfo;
        this.user.next(userInfo);
        // Force-Redirect bei Default-Passwort — sonst sieht der User das Dashboard
        // mit Banner, kann es aber wegklicken und steht weiter unsicher da.
        const target = userInfo.usedDefaultPassword ? '/change-password' : '/';
        this.router.navigate([target]);
      }
    } catch (err) {
      this.errorService.loginError = true;
      this.errorService.handleError(err);
    }
  }

  async logOut() {
    try {
      this.errorService.loginError = false;
      console.log('logging out');
      await firstValueFrom(this.http.post('/api/logout', {}));
    } catch (err) {
      this.errorService.loginError = true;
      this.errorService.handleError(err);
    } finally {
      this.remult.user = undefined;
      await this.router.navigate(['/login']);
    }
  }

  isAuthenticated() {
    try {
      return remult.authenticated();
    } catch (error) {
      this.errorService.loginError = true;
      this.errorService.handleError(error);
      return false;
    }
  }

  checkUser() {
    return async () => {
      try {
        this.errorService.loginError = false;
        const userInfo = (remult.user = await firstValueFrom(
          this.http.get<UserInfo>('/api/currentUser')
        ));
        this.user.next(userInfo);
        return userInfo;
      } catch (error) {
        this.errorService.loginError = true;
        this.errorService.handleError(error);
        remult.user = undefined;

        return false;
      }
    };
  }
}
