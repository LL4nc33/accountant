import { Component, Input, OnInit } from '@angular/core';

import { Router } from '@angular/router';
import { Repository, getEntityRef } from 'remult';
import { RelationFieldInfo, getRelationFieldInfo } from 'remult/internals';
import { RepositoryRelations, idType } from 'remult/src/remult3/remult3';
import { Base } from '../../../shared/entities/base';
import { NgForm } from '@angular/forms';

export interface RelationFormValidator {
  registerFormForValidation(form: NgForm): void;
  deregisterFormForValidation(form: NgForm): void;
}

@Component({
    selector: 'app-edit',
    imports: [],
    templateUrl: './edit.component.html',
    styleUrl: './edit.component.scss'
})
export abstract class EditComponent<TEntity extends Base>
  implements OnInit, RelationFormValidator
{
  entity?: TEntity|null;
  instance?: any;

  abstract rootPath: string;
  returnWithEntityId: boolean = true;

  @Input() id!: idType<TEntity>;
  abstract repo: Repository<TEntity>;
  fields: any;
  deleteList: (() => Promise<void>)[] = [];
  forms: any = [];

  constructor(private router: Router) {
    this.instance = this;
  }

  async ngOnInit() {
    // Set the 'fields' property to the metadata fields of the repository
    this.fields = this.repo.metadata.fields;

    // Check if the id is 'new'
    if (this.id == 'new') {
      // If it is, create a new entity using the repository's create method
      this.entity = await this.repo.create();
    } else {
      // If it's not 'new', find the entity with the given id using the repository's findId method
      this.entity = await this.repo.findId(this.id);
    }
  }

  protected async saveChanges() {
    if (this.entity) {
      for (const deleteFunc of this.deleteList) {
        await deleteFunc();
      }
      this.deleteList = [];
      this.entity = await this.saveRelations(this.repo, this.entity);
    }
    if(this.returnWithEntityId)
    {
    this.router.navigate([this.rootPath, this.entity!.id]);
    }
    else
    {
      this.router.navigate([this.rootPath]);
    }
  }

  /**
   * Soft-Delete-Toggle: setzt `archived` und speichert. Wird aus den Edit-
   * Templates per `(click)="toggleArchive()"` aufgerufen.
   */
  async toggleArchive() {
    if (!this.entity?.id) return;
    this.entity.archived = !this.entity.archived;
    this.entity = await this.repo.save(this.entity);
    this.router.navigate([this.rootPath]);
  }

  async saveRelations<T extends Base>(repo: Repository<T>, entity: T) {
    if (entity) {
      const result = await repo.save(entity);
      entity.id = result.id;

      const relationFields = Object.getOwnPropertyNames(entity)
        .map((fieldName) => {
          const info = getRelationFieldInfo(
            repo.metadata.fields[fieldName as keyof T]
          );
          return { fieldName, info };
        })
        .filter((x) => x.info) as {
        fieldName: string;
        info: RelationFieldInfo;
      }[];

      for (const relationField of relationFields) {
        const subRepo = repo.relations(entity)[
          relationField.fieldName as keyof RepositoryRelations<T>
        ] as Repository<Base>;
        const subEntities = entity[
          relationField.fieldName as keyof T
        ] as Base[];

        for (let index = 0; index < subEntities.length; index++) {
          const subEntity = subEntities[index];
          (subEntity as any)[relationField.info.options.field!] = entity.id;
          const subResult = await this.saveRelations(subRepo, subEntity);
          (result[relationField.fieldName as keyof T] as unknown[])[index] =
            subResult;
        }
      }
      return result;
    }
    return undefined;
  }

  async createRelationItem<T extends Base>(key: keyof TEntity) {
    const relationCollection = this.entity![key] as unknown[];

    if (relationCollection) {
      const relations = this.repo.relations(
        this.entity as TEntity
      ) as RepositoryRelations<TEntity>;

      relationCollection.push((relations[key] as Repository<T>).create());
    }
  }

  async deleteRelationItem<T extends Base>(key: keyof TEntity, item: T) {
    const relationCollection = this.entity![key] as Base[];
    relationCollection.splice(relationCollection.indexOf(item), 1);

    if (item.id) {
      this.deleteList.push(async () => {
        await getEntityRef(item).delete();
      });
    }
  }

  registerFormForValidation(form: NgForm) {
    this.forms.push(form);
  }
  deregisterFormForValidation(form: NgForm) {
    const index = this.forms.indexOf(form);
    this.forms.splice(index, 1);
  }

  hasInvalidForms() {
    return this.forms.find((form: NgForm) => form.invalid);
  }
}
