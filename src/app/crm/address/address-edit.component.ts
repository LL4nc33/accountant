import {
  AfterViewInit,
  Component,
  EventEmitter,
  Host,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ClrFormsModule } from '@clr/angular';
import { FieldsMetadata, getEntityRef } from 'remult';
import { Address } from '../../../shared/entities/address';
import { AutofieldComponent } from '../../core/autofield/autofield.component';
import { CountryPickerComponent } from '../../core/country-picker/country-picker.component';
import { EditComponent, RelationFormValidator } from '../../core/edit/edit.component';
import { Customer } from '../../../shared/entities/customer';
import { TranslateModule } from '@ngx-translate/core';

@Component({
    selector: 'app-address-edit',
    imports: [AutofieldComponent, CountryPickerComponent, FormsModule, ClrFormsModule, TranslateModule],
    templateUrl: './address-edit.component.html',
    styleUrl: './address-edit.component.scss'
})
export class AddressEditComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() address!: Address;
  fields!: FieldsMetadata<Address>;

   @Input() parent!: EditComponent<Customer>;

  @ViewChild(NgForm) form!: NgForm;

  constructor() {}

  ngOnInit(): void {
    if (this.address) {
      this.fields = getEntityRef(this.address).metadata.fields as FieldsMetadata<Address>;
    }
  }

  ngAfterViewInit(): void {
    this.parent.registerFormForValidation(this.form);
  }
  ngOnDestroy(): void {
    this.parent.deregisterFormForValidation(this.form);
  }
}
