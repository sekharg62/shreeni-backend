export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** skip/take for a page. */
export function pageArgs(page: number, limit: number) {
  return { skip: (page - 1) * limit, take: limit };
}

export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): Paginated<T> {
  return {
    data,
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}
