import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from './App';

afterEach(() => vi.unstubAllGlobals());

describe('bootstrap screen', () => {
  it.each([
    ['', 'スマホ操作画面（初期ひな形）', '/?view=desktop'],
    ['?view=desktop', 'PCホスト画面（初期ひな形）', '/'],
  ])('labels the current view and unfinished controls for %s', (search, title, href) => {
    vi.stubGlobal('window', { location: { search } });
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain(title);
    expect(html).toContain('Minecraftへの操作、セッション接続、役割割当は未実装です。');
    expect(html).toContain(`href="${href}"`);
    expect(html).not.toContain('<button');
  });
});
