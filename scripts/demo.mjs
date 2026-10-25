// Local visual preview only. It never binds the unprotected site to the public network.
if (process.env.NODE_ENV === 'production') {
  console.error('npm run demo предназначен только для локального просмотра. На хостинге используйте npm start.');
  process.exit(1);
}
process.env.GEOBLOCK_ENABLED = 'false';
process.env.HOST = '127.0.0.1';
const { start } = await import('../server.js');
start().catch(error => { console.error('Ошибка настройки:', error.message); process.exitCode = 1; });
