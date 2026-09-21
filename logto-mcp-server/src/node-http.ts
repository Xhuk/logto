import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Turn a Node `IncomingMessage` into a Fetch API `Request` so the MCP SDK v2
 * (web-standard) handler can run on `node:http`.
 */
export const incomingMessageToRequest = async (request: IncomingMessage): Promise<Request> => {
  const protocolHeader = request.headers['x-forwarded-proto'];
  const protocol =
    (Array.isArray(protocolHeader) ? protocolHeader[0] : protocolHeader)?.split(',')[0]?.trim() ||
    'http';
  const host = request.headers.host ?? '127.0.0.1';
  const url = `${protocol}://${host}${request.url ?? '/'}`;
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }

    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }

  const method = request.method ?? 'GET';

  if (method === 'GET' || method === 'HEAD') {
    return new Request(url, { method, headers });
  }

  const body = await readIncomingBody(request);

  return new Request(url, { method, headers, body, duplex: 'half' } as RequestInit);
};

const readIncomingBody = async (request: IncomingMessage): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    request.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    request.on('error', reject);
  });

export const sendNodeResponse = async (
  response: ServerResponse,
  webResponse: Response
): Promise<void> => {
  const headers: Record<string, string> = {};

  webResponse.headers.forEach((value, key) => {
    headers[key] = value;
  });

  response.writeHead(webResponse.status, headers);

  if (webResponse.body) {
    const buffer = Buffer.from(await webResponse.arrayBuffer());
    response.end(buffer);
    return;
  }

  response.end();
};

export const withCors = (webResponse: Response): Response => {
  const headers = new Headers(webResponse.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, MCP-Session-Id');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  headers.set('Access-Control-Expose-Headers', 'WWW-Authenticate, MCP-Session-Id');

  return new Response(webResponse.body, {
    status: webResponse.status,
    statusText: webResponse.statusText,
    headers,
  });
};
