export const HTTP_METHOD_GET = 'GET' as const;
export const HTTP_METHOD_POST = 'POST' as const;
export const HTTP_METHOD_PUT = 'PUT' as const;

export type HttpMethod = typeof HTTP_METHOD_GET | typeof HTTP_METHOD_POST | typeof HTTP_METHOD_PUT;
