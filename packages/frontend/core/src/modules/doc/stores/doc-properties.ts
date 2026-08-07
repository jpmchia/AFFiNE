import {
  LiveData,
  Store,
  yjsGetPath,
  yjsObserveDeep,
} from '@toeverything/infra';
import { isNil, omitBy } from 'lodash-es';
import {
  combineLatest,
  map,
  type Observable,
  startWith,
  switchMap,
} from 'rxjs';
import { AbstractType as YAbstractType, Map as YMap } from 'yjs';

import type { WorkspaceDBService } from '../../db';
import type { DocProperties } from '../../db/schema/schema';
import type { WorkspaceService } from '../../workspace';

interface LegacyDocProperties {
  custom?: Record<string, { value: unknown } | undefined>;
  system?: Record<string, { value: unknown } | undefined>;
}

export class DocPropertiesStore extends Store {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly dbService: WorkspaceDBService
  ) {
    super();
  }

  updateDocProperties(id: string, config: Partial<DocProperties>) {
    return this.dbService.db.docProperties.create({
      id,
      ...config,
    });
  }

  getDocProperties(id: string) {
    return {
      ...this.upgradeLegacyDocProperties(this.getLegacyDocProperties(id)),
      ...omitBy(this.dbService.db.docProperties.get(id), isNil),
      // db always override legacy, but nil value should not override
    };
  }

  watchDocProperties(id: string) {
    return combineLatest([
      this.watchLegacyDocProperties(id).pipe(
        map(this.upgradeLegacyDocProperties)
      ),
      this.dbService.db.docProperties.get$(id),
    ]).pipe(
      map(
        ([legacy, db]) =>
          ({
            ...legacy,
            ...omitBy(db, isNil), // db always override legacy, but nil value should not override
          }) as DocProperties
      )
    );
  }

  /**
   * find doc ids by property key and value
   *
   * This now includes legacy pageProperties so that properties which have not
   * yet been migrated to the new docProperties table are still discoverable.
   * New docProperties values always override legacy values.
   */
  watchPropertyAllValues(propertyKey: string) {
    return LiveData.from<Map<string, string | undefined>>(
      combineLatest([
        this.dbService.db.docProperties
          .select$(propertyKey)
          .pipe(
            map(
              o =>
                new Map<string, string | undefined>(
                  o.map(i => [i.id, i[propertyKey] as string | undefined])
                )
            )
          ),
        this.watchLegacyPropertyAllValues(propertyKey).pipe(
          startWith(new Map<string, string | undefined>())
        ),
      ]).pipe(
        map(
          ([dbValues, legacyValues]: [
            Map<string, string | undefined>,
            Map<string, string | undefined>,
          ]) => {
            const result = new Map(legacyValues);
            for (const [id, value] of dbValues) {
              result.set(id, value);
            }
            return result;
          }
        )
      ),
      new Map()
    );
  }

  private watchLegacyPropertyAllValues(
    propertyKey: string
  ): Observable<Map<string, string | undefined>> {
    return yjsGetPath(
      this.workspaceService.workspace.rootYDoc.getMap<any>(
        'affine:workspace-properties'
      ),
      'pageProperties'
    ).pipe(
      switchMap(yjsObserveDeep),
      map((pageProperties): Map<string, string | undefined> => {
        const result = new Map<string, string | undefined>();
        if (!(pageProperties instanceof YMap)) {
          return result;
        }
        const pages = (pageProperties as YMap<any>).toJSON() as Record<
          string,
          LegacyDocProperties
        >;
        for (const [id, props] of Object.entries(pages)) {
          const info =
            props?.custom?.[propertyKey] ?? props?.system?.[propertyKey];
          if (info?.value !== undefined && info.value !== null) {
            result.set(id, String(info.value));
          }
        }
        return result;
      })
    );
  }

  private upgradeLegacyDocProperties(properties?: LegacyDocProperties) {
    if (!properties) {
      return {};
    }
    const newProperties: Record<string, string> = {};
    for (const [key, info] of Object.entries(properties.system ?? {})) {
      if (info?.value !== undefined && info.value !== null) {
        newProperties[key] = info.value.toString();
      }
    }
    for (const [key, info] of Object.entries(properties.custom ?? {})) {
      if (info?.value !== undefined && info.value !== null) {
        newProperties['custom:' + key] = info.value.toString();
      }
    }
    return newProperties;
  }

  private getLegacyDocProperties(id: string) {
    return this.workspaceService.workspace.rootYDoc
      .getMap<any>('affine:workspace-properties')
      .get('pageProperties')
      ?.get(id)
      ?.toJSON() as LegacyDocProperties | undefined;
  }

  private watchLegacyDocProperties(id: string) {
    return yjsGetPath(
      this.workspaceService.workspace.rootYDoc.getMap<any>(
        'affine:workspace-properties'
      ),
      `pageProperties.${id}`
    ).pipe(
      switchMap(yjsObserveDeep),
      map(
        p =>
          (p instanceof YAbstractType ? p.toJSON() : p) as
            | LegacyDocProperties
            | undefined
      )
    );
  }
}
