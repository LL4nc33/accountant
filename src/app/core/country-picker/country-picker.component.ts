import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, forwardRef } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ClarityModule } from '@clr/angular';
import { euCountries, nonEuCountriesCommon, countryName } from '../../../shared/entities/country';

@Component({
  selector: 'app-country-picker',
  imports: [CommonModule, FormsModule, ClarityModule],
  templateUrl: './country-picker.component.html',
  styleUrl: './country-picker.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CountryPickerComponent),
      multi: true,
    },
  ],
})
export class CountryPickerComponent implements ControlValueAccessor {
  @Input() label = 'Land';

  euCountries = euCountries;
  nonEu = nonEuCountriesCommon;
  countryName = countryName;

  value = '';
  disabled = false;

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(v: string): void { this.value = v ?? ''; }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled = d; }

  onSelect(v: string) {
    this.value = v;
    this.onChange(v);
    this.onTouched();
  }
}
