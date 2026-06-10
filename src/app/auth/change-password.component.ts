import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-change-password',
  imports: [CommonModule, FormsModule, ClarityModule],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.scss',
})
export class ChangePasswordComponent implements OnInit {
  /**
   * Wenn true, ist der User noch mit dem Default-Passwort (admin/admin) drin.
   * In dem Fall blenden wir das „Aktuelles Passwort"-Feld aus
   * (das alte Passwort ist öffentlich bekannt, das schützt nichts).
   */
  forcedFromDefault = false;
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  saving = false;
  error = '';

  constructor(
    private http: HttpClient,
    private router: Router,
    private toastr: ToastrService,
    private auth: AuthService,
  ) {}

  async ngOnInit() {
    this.auth.user.subscribe((u: any) => {
      this.forcedFromDefault = !!(u && u.usedDefaultPassword);
    });
    // user.next() in logIn() läuft BEVOR diese Component mountet → Subject hat keinen
    // Replay. Wir holen den Status nochmal vom Server damit forcedFromDefault stimmt.
    await this.auth.checkUser()();
  }

  async submit() {
    this.error = '';
    if (this.newPassword.length < 8) {
      this.error = 'Neues Passwort muss mindestens 8 Zeichen haben.';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.error = 'Die zwei Passwörter stimmen nicht überein.';
      return;
    }
    this.saving = true;
    try {
      await firstValueFrom(
        this.http.post('/api/change-password', {
          currentPassword: this.currentPassword,
          newPassword: this.newPassword,
        }),
      );
      this.toastr.success('Passwort gesetzt.');
      // Re-fetch currentUser damit der Banner verschwindet
      await this.auth.checkUser()();
      this.router.navigateByUrl('/');
    } catch (e: any) {
      this.error = e?.error?.error ?? e?.message ?? 'Fehler beim Speichern.';
    } finally {
      this.saving = false;
    }
  }
}
