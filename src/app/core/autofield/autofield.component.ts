import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  ControlContainer,
  FormsModule,
  NgForm,
  ValidationErrors,
} from '@angular/forms';
import {
  ClarityModule,
  ClrCheckboxModule,
  ClrComboboxModule,
  ClrDatepickerModule,
  ClrFormsModule,
  ClrTextareaModule,
} from '@clr/angular';
import { FieldMetadata, getEntityRef, getValueList } from 'remult';

@Component({
  selector: 'app-autofield',
  imports: [
    CommonModule,
    FormsModule,
    ClrFormsModule,
    ClarityModule,
    ClrCheckboxModule,
    ClrComboboxModule,
    ClrTextareaModule,
    ClrDatepickerModule,
  ],
  templateUrl: './autofield.component.html',
  styleUrl: './autofield.component.scss',
  viewProviders: [{ provide: ControlContainer, useExisting: NgForm }],
})
export class AutofieldComponent {
  @Input()
  width: string = '100%';

  @Input()
  rows: string = '4';

  @Input()
  showLabel = true;

  @Input()
  entity!: any;

  @Output()
  entityChange = new EventEmitter<any>();

  @Input()
  field!: FieldMetadata;

  @Input()
  helperText: string = '';

  @Input()
  label: string = '';

  @Input()
  placeholder: string = '';

  constructor(public form: NgForm) {}

  getOptionValues(field: string) {
    return getValueList(this.field);
  }

  async onBlur($event: FocusEvent) {
    if (!this.entity || !this.field) return;
    const ref = getEntityRef(this.entity);
    const result = await ref.validate();
    if (result && result.modelState) {
      this.form.form
        .get(this.field.key)
        ?.setErrors(
          result?.modelState[this.field.key] as unknown as ValidationErrors
        );
    }
  }
}
