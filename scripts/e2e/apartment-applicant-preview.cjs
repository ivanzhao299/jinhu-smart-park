/* Local, synthetic layout preview only. No API, login, database or submission. */
const { createRequire } = require('node:module');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createServer } = require('node:http');
const web = resolve(__dirname, '../../apps/web');
const webRequire = createRequire(resolve(web, 'package.json'));
webRequire('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node', jsx: 'react-jsx' }, project: resolve(web, 'tsconfig.json') });
require.extensions['.css'] = (module) => { module.exports = new Proxy({}, { get: (_, key) => key === '__esModule' ? false : key }); };
const React = webRequire('react');
const { renderToStaticMarkup } = webRequire('react-dom/server');
const { ApartmentCreatePanel } = webRequire('./app/apartments/ApartmentCreatePanel.tsx');
const css = [resolve(web, 'app/globals.css'), resolve(web, 'app/apartments/ApartmentWorkbench.module.css')].map(path => readFileSync(path, 'utf8')).join('\n');
const markup = renderToStaticMarkup(React.createElement(ApartmentCreatePanel, { view: 'applications', onDone: async () => {}, onError: () => {} }));
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>入住申请表单预览</title><style>${css}</style></head><body><main class="ds-page" style="padding:16px;max-width:1200px;margin:auto"><p>本地布局预览 · 不提交数据</p>${markup}</main><script>document.querySelector('form').addEventListener('submit',event=>event.preventDefault());</script></body></html>`;
createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); }).listen(3236, '127.0.0.1', () => console.log('Apartment layout preview: http://127.0.0.1:3236'));
