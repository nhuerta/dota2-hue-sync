const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export function createResponse(
  body?: unknown,
  options: { status?: number; headers?: Record<string, string> } = {}
): Response {
  const { status = 200, headers = {} } = options;
  if (body === null || body === undefined) {
    return new Response(null, { status, headers: { ...corsHeaders, ...headers } });
  }
  if (typeof body === 'string') {
    return new Response(body, { status, headers: { ...corsHeaders, ...headers } });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...headers
    }
  });
}
