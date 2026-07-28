import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { GroupByProvider } from '../../provider';
import type { GroupByParams } from '../../types';

export class IncludeInTimelineGroupByProvider
  extends Service
  implements GroupByProvider
{
  constructor(private readonly docsService: DocsService) {
    super();
  }

  groupBy$(
    _items$: Observable<Set<string>>,
    _params: GroupByParams
  ): Observable<Map<string, Set<string>>> {
    return this.docsService.propertyValues$('includeInTimeline').pipe(
      map(values => {
        const result = new Map<string, Set<string>>();
        for (const [id, value] of values) {
          const includeInTimeline = value ? 'true' : 'false';
          if (!result.has(includeInTimeline)) {
            result.set(includeInTimeline, new Set([id]));
          } else {
            result.get(includeInTimeline)?.add(id);
          }
        }
        return result;
      })
    );
  }
}
