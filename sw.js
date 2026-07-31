/* 도쿄 여행 PWA — 서비스워커
 * 앱 셸(HTML·아이콘·지도·폰트)을 캐시해 오프라인 동작을 지원합니다.
 * 데이터 API(Apps Script)는 절대 캐시하지 않습니다 — 항상 네트워크로 보냅니다.
 * 캐시를 새로 배포하려면 CACHE 버전 숫자를 올리세요.
 */
var CACHE = 'tokyo-pwa-v35';

/* 설치 때 미리 받아둘 앱 셸.
 * CDN 라이브러리(jsdelivr·unpkg)는 CORS 허용 응답이라 precache가 됩니다. */
var CORE = [
  './',
  'index.html',
  'manifest.json',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) {
        // 개별 실패가 설치 전체를 막지 않도록 하나씩 담습니다.
        return Promise.all(CORE.map(function (u) {
          // GitHub Pages는 Cache-Control: max-age=600을 보냅니다.
          // 그냥 받으면 브라우저 HTTP 캐시의 옛 파일을 그대로 캐시에 담게 되므로,
          // 우리 파일은 cache:'reload'로 HTTP 캐시를 건너뛰고 새로 받습니다.
          var mine = u.indexOf('http') !== 0;
          var what = mine ? new Request(u, { cache: 'reload' }) : u;
          return c.add(what).catch(function () {});
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;

  // 데이터 쓰기·읽기(POST 등)는 손대지 않고 그대로 네트워크로 보냅니다.
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // Apps Script(데이터 API)는 캐시 금지 — 항상 최신을 받아야 합니다.
  if (url.hostname.indexOf('script.google') !== -1) return;

  // 환율·날씨는 계속 바뀌는 값입니다. 캐시 우선으로 두면 값이 고정돼 버리므로
  // 네트워크를 먼저 쓰고, 오프라인일 때만 마지막으로 받은 값을 씁니다.
  if (url.hostname === 'open.er-api.com' || url.hostname === 'api.open-meteo.com') {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  // 페이지 이동 요청: 네트워크 우선, 오프라인이면 캐시된 셸을 돌려줍니다.
  // cache:'reload'로 HTTP 캐시를 건너뜁니다. 이게 없으면 max-age=600 때문에
  // 새로 배포해도 최대 10분간 옛 화면이 뜹니다.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req.url, { cache: 'reload' }).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put('index.html', copy); });
        }
        return res;
      }).catch(function () { return caches.match('index.html'); })
    );
    return;
  }

  // 그 외 GET(정적 자원·지도 타일 등): 캐시 우선, 없으면 네트워크 후 캐시에 저장.
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && (res.status === 200 || res.type === 'opaque')) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
