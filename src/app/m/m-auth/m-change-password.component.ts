import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { MFormSectionComponent } from '../m-core/m-form-section.component';

@Component({
  selector: 'm-change-password',
  standalone: true,
  imports: [CommonModule, FormsModule, MFormSectionComponent],
  template: `
    <form class="m-form" (ngSubmit)="submit()">
      <m-form-section title="Passwort ändern">
        <p *ngIf="forcedFromDefault" class="m-muted-small">
          Du verwendest noch das Default-Passwort. Bitte jetzt setzen.
        </p>

        <label class="m-field" *ngIf="!forcedFromDefault">
          <span>Aktuelles Passwort</span>
          <input type="password" name="current" [(ngModel)]="currentPassword" autocomplete="current-password" />
        </label>

        <label class="m-field">
          <span>Neues Passwort *</span>
          <input type="password" name="new" [(ngModel)]="newPassword" autocomplete="new-password" minlength="8" required />
        </label>

        <label class="m-field">
          <span>Bestätigen *</span>
          <input type="password" name="confirm" [(ngModel)]="confirmPassword" autocomplete="new-password" required />
        </label>

        <p *ngIf="error" class="m-error">{{ error }}</p>
      </m-form-section>

      <div class="m-form-actions">
        <button type="submit" class="m-pill m-pill-primary" [disabled]="saving">
          {{ saving ? 'Speichert…' : 'Passwort setzen' }}
        </button>
      </div>
    </form>
  `,
  styles: [`
    .m-error {
      color: #d62828;
      font-size: 0.9rem;
      margin: 0.5rem 0 0;
    }
  `],
  styleUrls: ['../m-expenses/m-expense-edit.component.scss'],
})
export class MChangePasswordComponent implements OnInit {
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
      await this.auth.checkUser()();
      this.router.navigateByUrl('/m');
    } catch (e: any) {
      this.error = e?.error?.error ?? e?.message ?? 'Fehler beim Speichern.';
    } finally {
      this.saving = false;
    }
  }
}
