import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClrCheckboxModule, ClrDropdownModule, ClrInputModule, ClrPasswordModule, ClrSelectModule } from '@clr/angular';
import { AuthService } from './auth.service';
import {} from '@angular/common/http';
import { ErrorService } from '../error.service';

@Component({
    selector: 'app-auth',
    imports: [CommonModule, FormsModule, ClrDropdownModule, ClrSelectModule, ClrInputModule, ClrPasswordModule, ClrCheckboxModule],
    templateUrl: './auth.component.html',
    styleUrl: './auth.component.scss'
})
export class AuthComponent {

  constructor(@Inject(AuthService) public auth: AuthService, public errorService: ErrorService) {}

  form = {
    username: '',
    type: 'user',
    password: '',
    rememberMe: false,
  }

  login() {
    this.auth.logIn(this.form.username, this.form.password);
  }
}
