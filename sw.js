/* 도쿄 여행 PWA — 서비스워커
 * 앱 셸(HTML·아이콘·지도·폰트)을 캐시해 오프라인 동작을 지원합니다.
 * 데이터 API(Apps Script)는 절대 캐시하지 않습니다 — 항상 네트워크로 보냅니다.
 * 캐시를 새로 배포하려면 CACHE 버전 숫자를 올리세요.
 */
var CACHE = 'tokyo-pwa-v47';

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
      /* 오프라인이고 받아둔 적도 없으면 caches.match가 undefined를 줍니다.
         respondWith에 undefined가 가면 요청이 네트워크 오류로 끝납니다.
         환율·날씨는 없어도 되는 값이라 빈 응답으로 조용히 넘깁니다. */
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || new Response('', { status: 504, statusText: '오프라인' });
        });
      })
    );
    return;
  }

  // 페이지 이동 요청: 네트워크 우선, 오프라인이면 캐시된 셸을 돌려줍니다.
  // cache:'reload'로 HTTP 캐시를 건너뜁니다. 이게 없으면 max-age=600 때문에
  // 새로 배포해도 최대 10분간 옛 화면이 뜹니다.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req.url, { cache: 'reload' }).then(function (res) {
        /* 예전에는 상태만 보고 그대로 돌려줬습니다. 그런데 비행기모드에서
           fetch가 거부되지 않고 실패한 응답(status 0 등)을 주는 경우가 있어
           그게 그대로 화면에 나가 앱이 안 떴습니다. 성공이 아니면 캐시로 넘깁니다. */
        if (!res || !res.ok) throw new Error('네트워크 응답이 정상이 아닙니다');
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('index.html', copy); });
        return res;
      }).catch(function () {
        /* 캐시를 여러 이름으로 찾아봅니다. 어느 하나라도 있으면 앱이 뜹니다.
           그리고 respondWith에 undefined가 가면 브라우저가 네트워크 오류 화면을
           띄웁니다. 그래서 마지막에 반드시 무언가를 돌려줍니다. */
        return caches.match('index.html')
          .then(function (hit) { return hit || caches.match('./'); })
          .then(function (hit) { return hit || caches.match(req.url); })
          .then(function (hit) {
            return hit || new Response(
              '<!doctype html><meta charset="utf-8">' +
              '<meta name="viewport" content="width=device-width,initial-scale=1">' +
              '<div style="font:16px -apple-system,sans-serif;padding:40px;text-align:center">' +
              '<h1 style="font-size:20px">오프라인</h1>' +
              '<p style="color:#666">앱 파일을 캐시에서 찾지 못했습니다.<br>' +
              '인터넷이 되는 곳에서 한 번 열면 다음부터 오프라인에서도 열립니다.</p></div>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
          });
      })
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
      /* 오프라인에서 캐시에 없는 것(지도 타일 등)은 조용히 비웁니다.
         여기서 거부되게 두면 처리되지 않은 오류가 계속 쌓입니다. */
      }).catch(function () {
        return new Response('', { status: 504, statusText: '오프라인' });
      });
    })
  );
});
