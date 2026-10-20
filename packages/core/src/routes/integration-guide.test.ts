import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import koaErrorHandler from '#src/middleware/koa-error-handler.js';
import koaI18next from '#src/middleware/koa-i18next.js';
import { createRequester } from '#src/utils/test-utils.js';

import integrationGuideRoutes, {
  guidePathCandidates,
  readIntegrationGuide,
  resolveGuidePath,
} from './integration-guide.js';

const originalPath = process.env.KATRA_INTEGRATION_GUIDE_PATH;

const writeGuide = (content: string): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'katra-guide-'));
  const file = path.join(directory, 'guide.md');
  fs.writeFileSync(file, content, 'utf8');

  return file;
};

const restoreEnvironment = () => {
  if (originalPath === undefined) {
    Reflect.deleteProperty(process.env, 'KATRA_INTEGRATION_GUIDE_PATH');
  } else {
    process.env.KATRA_INTEGRATION_GUIDE_PATH = originalPath;
  }
};

const buildRequester = () =>
  createRequester({
    anonymousRoutes: integrationGuideRoutes,
    middlewares: [koaI18next(), koaErrorHandler()],
  });

describe('integration guide path resolution', () => {
  afterEach(restoreEnvironment);

  it('prefers the path the deployment pins', () => {
    const file = writeGuide('# hi');
    process.env.KATRA_INTEGRATION_GUIDE_PATH = file;

    expect(guidePathCandidates()[0]).toBe(file);
    expect(resolveGuidePath()).toBe(file);
  });

  it('falls back to the copies inside the repo when nothing is pinned', () => {
    Reflect.deleteProperty(process.env, 'KATRA_INTEGRATION_GUIDE_PATH');

    const candidates = guidePathCandidates();

    // Repo root, packages/core (the image cwd) and the compiled layout.
    expect(candidates).toHaveLength(3);
    expect(candidates.every((candidate) => candidate.endsWith('integration-guide.md'))).toBe(true);
  });
});

describe('readIntegrationGuide', () => {
  afterEach(restoreEnvironment);

  it('reads the contract version out of the front matter', () => {
    process.env.KATRA_INTEGRATION_GUIDE_PATH = writeGuide(
      ['---', 'version: 2', 'updated_at: 2026-10-20', '---', '', '# Guía'].join('\n')
    );

    const guide = readIntegrationGuide();

    expect(guide.version).toBe('2');
    expect(guide.updatedAt).toBe('2026-10-20');
    expect(guide.markdown).toContain('# Guía');
  });

  it('does not pretend to know a version when the front matter is missing', () => {
    process.env.KATRA_INTEGRATION_GUIDE_PATH = writeGuide('# sin front matter');

    expect(readIntegrationGuide().version).toBe('unknown');
    expect(readIntegrationGuide().updatedAt).toBeUndefined();
  });
});

describe('GET /katra/integration-guide', () => {
  afterEach(restoreEnvironment);

  it('serves the guide without any credentials', async () => {
    process.env.KATRA_INTEGRATION_GUIDE_PATH = writeGuide(
      ['---', 'version: 2', '---', '', '# Guía canónica'].join('\n')
    );

    const response = await buildRequester().get('/katra/integration-guide');

    expect(response.status).toEqual(200);
    expect(response.body).toMatchObject({ version: '2' });
    expect(response.body.markdown).toContain('# Guía canónica');
  });

  it('serves readable markdown when it is asked for', async () => {
    process.env.KATRA_INTEGRATION_GUIDE_PATH = writeGuide('---\nversion: 2\n---\n# Guía');

    const response = await buildRequester().get('/katra/integration-guide?format=markdown');

    expect(response.status).toEqual(200);
    expect(response.headers['content-type']).toContain('text/markdown');
    expect(response.text).toContain('# Guía');
  });

  it('publishes the contract version so a reader knows what it holds', async () => {
    process.env.KATRA_INTEGRATION_GUIDE_PATH = writeGuide('---\nversion: 3\n---\n# Guía');

    const response = await buildRequester().get('/katra/integration-guide');

    expect(response.headers['x-katra-guide-version']).toBe('3');
    expect(response.headers['cache-control']).toContain('max-age=300');
  });
});
