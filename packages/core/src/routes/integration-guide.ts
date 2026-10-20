import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import RequestError from '#src/errors/RequestError/index.js';
import koaGuard from '#src/middleware/koa-guard.js';
import assertThat from '#src/utils/assert-that.js';

import type { ManagementApiRouter, RouterInitArgs } from './types.js';

/**
 * Serves the canonical integration guide so an implementer — a person or a model — reads the same
 * contract the IdP enforces instead of guessing from the code.
 *
 * It is gated like the rest of the management API (`koaAuth` already requires `scope: all`) plus one
 * extra rule: the caller must be a **machine** (`type: 'app'`). An enrolled application with its M2M
 * credentials can read it; a user token cannot. That is the point: the guide describes server-side
 * flows, and handing it to a browser session would be answering a question nobody asked.
 */

const integrationGuideRoute = '/katra/integration-guide';

/** Where the served copy may live, in order. The compose pins the first one. */
export const guidePathCandidates = (): string[] => {
  const fromEnvironment = process.env.KATRA_INTEGRATION_GUIDE_PATH;

  return [
    ...(fromEnvironment === undefined || fromEnvironment === '' ? [] : [fromEnvironment]),
    // Cwd is the repo root when running from source.
    path.join(process.cwd(), 'docs/katra/integration-guide.md'),
    // Cwd is packages/core in the image, where `npm start` does `node .`.
    path.join(process.cwd(), '../../docs/katra/integration-guide.md'),
    // Compiled output: packages/core/build/routes -> repo root. `import.meta.dirname` is not always
    // available (test runners), so the directory is derived from the module URL.
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../docs/katra/integration-guide.md'
    ),
  ];
};

export const resolveGuidePath = (): string => {
  const found = guidePathCandidates().find((candidate) => fs.existsSync(candidate));

  assertThat(
    found,
    new RequestError({
      code: 'request.general',
      status: 500,
      message: 'The integration guide is not shipped in this image.',
    })
  );

  return found;
};

type IntegrationGuide = {
  /** Contract version, read from the document front matter. */
  version: string;
  updatedAt: string | undefined;
  markdown: string;
};

const readFrontMatter = (markdown: string, key: string): string | undefined => {
  const match = new RegExp(`^${key}:\\s*(.+)$`, 'mu').exec(markdown);

  return match?.[1]?.trim();
};

export const readIntegrationGuide = (): IntegrationGuide => {
  const markdown = fs.readFileSync(resolveGuidePath(), 'utf8');

  return {
    version: readFrontMatter(markdown, 'version') ?? 'unknown',
    updatedAt: readFrontMatter(markdown, 'updated_at'),
    markdown,
  };
};

export default function integrationGuideRoutes<T extends ManagementApiRouter>(
  ...[router]: RouterInitArgs<T>
) {
  router.get(
    integrationGuideRoute,
    // No response guard: the body is either the parsed guide or raw markdown, and the guard would
    // reject the second shape.
    koaGuard({ status: [200, 401, 403, 500] }),
    async (ctx, next) => {
      // `koaAuth` has already proven the token carries `all`; this proves it is a machine token.
      assertThat(
        ctx.auth.type === 'app',
        new RequestError({
          code: 'auth.forbidden',
          status: 403,
          message: 'The integration guide is only served to a machine token (M2M).',
        })
      );

      const guide = readIntegrationGuide();

      // `curl` should get something readable, a program should get something parseable.
      const wantsMarkdown =
        ctx.query.format === 'markdown' ||
        (ctx.request.headers.accept ?? '').includes('text/markdown');

      if (wantsMarkdown) {
        ctx.set('Content-Type', 'text/markdown; charset=utf-8');
        ctx.set('X-Katra-Guide-Version', guide.version);
        ctx.body = guide.markdown;

        return next();
      }

      ctx.body = guide;

      return next();
    }
  );
}
