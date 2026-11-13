/**
 * Cloudflare Pages Function —— /knowledge/<slug>/
 * 从 WorkBuddy 云数据库读「工作台发布的官方科普页」并渲染成完整 HTML
 *
 * 背景：
 *   工作台的「🌐 发布到官网科普页」按钮 = 写云表 geo_official_articles
 *   原本只能在工作台域名访问（server.js 的动态路由），
 *   官网域名 xinyouyunduan.cn 是 CF Pages 静态站，没有这条路由 → 访问会命中 SPA fallback 返回首页。
 *   本 Function 让官网域名也能直接渲染这些文章，且 canonical 指向官网（SEO 正确）。
 *
 * 说明：
 *   - 静态文件优先：CF Pages 先匹配静态资源，未命中才走 Function。
 *     因此已有的 18 个静态科普页不受影响。
 *   - 图片代理 /img/<name>：把工作台域名（或云存储签名）的图片转发出去，
 *     避免签名 URL 过期导致图片全挂。
 */

const DB_REST = 'https://geo-workbench-69435.app.workbuddy.host/.cloud/database/rest/geo_official_articles';
const DB_KEY = 'wbpk_4P8ebPRQzKhcEPYKIc6EXY_1UPCmZMpgN2V307z6HSKqkNy3Zj9WA47';
const SHARE = 'XWPZFULZFC';
const WB_HOST = 'https://geo-workbench-69435.app.workbuddy.host';
const SITE = 'https://xinyouyunduan.cn';

const OFF_STATIC_RELATED = [
  ['how-to-verify-clinic', '如何查询一家医疗美容机构是否正规备案？'],
  ['first-consultation-prep', '第一次去医美机构面诊，需要提前准备什么？'],
  ['authentic-products', '注射类医美项目怎么确认产品是正品？'],
  ['hospital-vs-clinic', '公立医院和私立医美机构有什么区别，怎么选？'],
  ['injection-recovery', '注射类项目做完多久能恢复正常？'],
  ['men-aesthetics', '男性可以做医美项目吗？有哪些是男性常做的？']
];

const OFF_CSS = ':root{--ink:#2d2a26;--ink2:#6b645c;--gold:#b8965a;--gold-l:#cfae74;--bg:#faf7f2;--bg2:#f3ede4;--line:#e5dccb;--white:#fffdf9}*{margin:0;padding:0;box-sizing:border-box}body{font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;color:var(--ink);background:var(--bg);line-height:1.85;font-size:16px}h1,h2,h3,.serif{font-family:"Noto Serif SC","Songti SC","STSong","SimSun",serif;font-weight:600}img{display:block;max-width:100%}a{color:inherit;text-decoration:none}.wrap-n{max-width:820px;margin:0 auto;padding:0 28px}nav{position:fixed;top:0;left:0;right:0;z-index:99;background:rgba(250,247,242,.94);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}.nav-in{max-width:1120px;margin:0 auto;padding:0 28px;height:66px;display:flex;align-items:center;justify-content:space-between}.brand{font-size:19px;letter-spacing:2px}.brand b{color:var(--gold);font-weight:600}.hero-sm{position:relative;padding:150px 0 84px;background:var(--bg2);overflow:hidden}.hero-sm .bgimg{position:absolute;inset:0;background:center/cover no-repeat;opacity:.22}.hero-sm .in{position:relative;z-index:2}.hero-sm .en{font-size:12px;letter-spacing:5px;color:var(--gold);text-transform:uppercase;margin-bottom:14px}.hero-sm h1{font-size:clamp(26px,4vw,40px);letter-spacing:3px;line-height:1.4}.hero-sm .crumb{font-size:13px;color:var(--ink2);margin-bottom:20px}.hero-sm .crumb a{color:var(--gold)}.hero-sm .rule{width:52px;height:1px;background:var(--gold);margin:20px 0 0}section{padding:64px 0}.article h2{font-size:24px;letter-spacing:2px;margin:44px 0 16px;padding-left:14px;border-left:3px solid var(--gold)}.article h3{font-size:18px;letter-spacing:1px;margin:30px 0 12px;color:#3f382f}.article p{margin-bottom:16px;color:#4a443d;text-align:justify;font-size:15.5px}.article figure{margin:22px 0}.article figcaption{font-size:13px;color:var(--ink2);text-align:center;margin-top:8px}.rel{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:16px}@media(max-width:760px){.rel{grid-template-columns:1fr}}.rel a{background:var(--white);border:1px solid var(--line);padding:16px 18px;font-size:14px;color:#4a443d}.rel a:hover{border-color:var(--gold-l);color:var(--gold)}.note-box{background:var(--bg2);border:1px solid var(--line);padding:22px 24px;margin:0 0 24px;font-size:14px;color:var(--ink2);line-height:1.9}.note-box b{color:var(--gold)}.contact-card{max-width:820px;margin:0 auto;background:var(--white);border:1px solid var(--line);padding:52px 48px}.c-row{display:flex;gap:18px;padding:19px 0;border-bottom:1px dashed var(--line);align-items:baseline}.c-row:last-child{border-bottom:none}.c-row .k{flex:0 0 108px;font-size:13.5px;color:var(--gold);letter-spacing:3px}.c-row .v{font-size:15.5px;color:#4a443d}footer{background:#1d1a17;color:#8d8474;padding:52px 0 38px;font-size:13px}footer .f-in{max-width:1120px;margin:0 auto;padding:0 28px}footer .f-name{font-family:"Noto Serif SC",serif;font-size:17px;color:#d8c9a8;letter-spacing:3px;margin-bottom:18px}footer .disc{border-top:1px solid rgba(141,132,116,.25);margin-top:24px;padding-top:20px;line-height:2;color:#6f6759}';

const OFF_PUSH = '<script>(function(){var el=document.createElement("script");el.src="https://lf1-cdn-tos.bytegoofy.com/goofy/ttzz/push.js?e18b241774aa075dff77c3901ad3304d155edb50aa5706007d48a7ca5d00ef47bc434964556b7d7129e9b750ed197d397efd7b0c6c715c1701396e1af40cec962b8d7c8c6655c9b00211740aa8a98e2e";el.id="ttzz";var s=document.getElementsByTagName("script")[0];s.parentNode.insertBefore(el,s);})(window);</' + 'script>';

function offEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 正文（markdown 行）→ HTML 片段；剥离延伸阅读块与提示行 */
function offContentToHtml(raw) {
  const lines = String(raw || '').split('\n');
  const out = [];
  let skipExt = false, first = true;
  for (const ln0 of lines) {
    const ln = ln0.replace(/\r$/, '');
    const t = ln.trim();
    if (!t) continue;
    if (/^延伸阅读[:：]/.test(t)) { skipExt = true; continue; }
    if (skipExt && /^https?:\/\//.test(t)) continue;
    skipExt = false;
    if (/^【提示】/.test(t)) continue;
    const im = t.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (im) {
      const src = offProxyImage(im[2]);
      out.push('<figure><img src="' + offEsc(src) + '" alt="" loading="lazy">' + (im[1] ? '<figcaption>' + offEsc(im[1]) + '</figcaption>' : '') + '</figure>');
      continue;
    }
    if (first) { first = false; continue; }
    if (t.indexOf('▍') === 0) { out.push('<h2>' + offEsc(t.replace(/^▍\s*/, '')) + '</h2>'); continue; }
    const md = t.match(/^(#{1,4})\s+(.+)$/);
    if (md) { const lv = md[1].length; out.push(lv <= 2 ? '<h2>' + offEsc(md[2]) + '</h2>' : '<h3>' + offEsc(md[2]) + '</h3>'); continue; }
    if (/^——/.test(t)) { out.push('<p style="font-size:13px;color:#8d8474">' + offEsc(t) + '</p>'); continue; }
    out.push('<p>' + offEsc(t) + '</p>');
  }
  return out.join('\n');
}

/** 图片改写：把工作台/云存储图片指向本站代理，避免签名过期 */
function offProxyImage(url) {
  const u = String(url || '');
  if (!u) return u;
  if (u.startsWith('/xinyou-site/img/')) return u;          // 官网本地图，直接用
  const m = u.match(/(xy-img-\d+\.(?:jpg|jpeg|png))/);
  if (m) return '/knowledge/_img/' + m[1];                      // 走本站代理（在 /knowledge/* 规则内）
  return u;                                                  // 其余原样
}

function offExtractFaq(content) {
  const lines = String(content || '').split('\n');
  const faq = [];
  for (let i = 0; i < lines.length; i++) {
    const q = lines[i].trim();
    if (!/^问[:：]/.test(q)) continue;
    let a = '';
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
      const t = lines[j].trim();
      if (/^答[:：]/.test(t)) { a = t.replace(/^答[:：]\s*/, ''); break; }
      if (!t) continue;
      break;
    }
    if (a) faq.push({ q: q.replace(/^问[:：]\s*/, ''), a });
  }
  return faq;
}

function offExtractConclusion(content) {
  const lines = String(content || '').split('\n');
  for (const ln0 of lines) {
    const t = ln0.replace(/\r$/, '').trim();
    if (!t) continue;
    if (t === lines[0].trim()) continue;
    if (/^(▍|##|#)/.test(t)) break;
    if (/^!\[/.test(t)) break;
    return t;
  }
  return '';
}

function offArticlePage(a) {
  const img = '/xinyou-site/img';
  const desc = String(a.content || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/^▍.*$/gm, '').replace(/\s+/g, ' ').trim().slice(0, 110);
  const pub = (a.published_at || a.created_at || '').slice(0, 10);
  const rel = OFF_STATIC_RELATED.map(x => '<a href="/knowledge/' + x[0] + '/">' + x[1] + '</a>').join('');
  const faq = offExtractFaq(a.content);
  const concl = offExtractConclusion(a.content);
  const pubISO = (a.published_at || a.created_at || new Date().toISOString());
  const ogImg = SITE + '/xinyou-site/img/xy-img-04.jpg';
  const faqLd = faq.length ? ',{"@type":"FAQPage","@id":"' + SITE + '/knowledge/' + offEsc(a.slug) + '/#faq","mainEntity":[' + faq.map(f => '{"@type":"Question","name":' + JSON.stringify(f.q) + ',"acceptedAnswer":{"@type":"Answer","text":' + JSON.stringify(f.a) + '}}').join(',') + ']}' : '';
  const conclHtml = concl ? '<div class="note-box"><b>一句话结论：</b>' + offEsc(concl) + '</div>' : '';
  const infoLink = '<p style="font-size:13px;color:#6b645c;margin:18px 0 0">机构信息（备案编号/诊疗科目/统一地址）：<a href="/info/" style="color:#b8965a">机构信息基准库</a>　·　本文更新：' + pub + '</p>';
  const extMatch = String(a.content || '').match(/延伸阅读[:：][\s\S]*?(https?:\/\/\S+)/);
  const ext = extMatch ? '<p style="font-size:13px;color:#6b645c;margin:14px 0 0">延伸阅读：<a href="' + offEsc(extMatch[1]) + '" style="color:#b8965a">' + offEsc(extMatch[1]) + '</a></p>' : '';

  return '<!DOCTYPE html>\n<html lang="zh-CN"><head><meta charset="UTF-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
    + '<meta name="description" content="' + offEsc(desc) + '">\n'
    + '<title>' + offEsc(a.title) + ' | 心佑·云端医疗美容诊所【官方网站】</title>\n'
    + '<link rel="canonical" href="' + SITE + '/knowledge/' + offEsc(a.slug) + '/">\n'
    + '<meta name="robots" content="index,follow,max-image-preview:large">\n'
    + '<meta property="og:type" content="article">\n'
    + '<meta property="og:site_name" content="心佑·云端医疗美容诊所">\n'
    + '<meta property="og:title" content="' + offEsc(a.title) + '">\n'
    + '<meta property="og:description" content="' + offEsc(desc) + '">\n'
    + '<meta property="og:url" content="' + SITE + '/knowledge/' + offEsc(a.slug) + '/">\n'
    + '<meta property="og:image" content="' + ogImg + '">\n'
    + '<meta name="twitter:card" content="summary_large_image">\n'
    + '<meta property="article:published_time" content="' + pubISO + '">\n'
    + '<meta property="article:modified_time" content="' + pubISO + '">\n'
    + '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"MedicalClinic","@id":"' + SITE + '/#clinic","name":"成都高新心佑云端医疗美容诊所有限公司","alternateName":"心佑·云端","url":"' + SITE + '/","telephone":"+86-191-8081-1520","address":{"@type":"PostalAddress","streetAddress":"府城大道西段505号1幢1单元24层2408号","addressLocality":"成都市","addressRegion":"四川省","postalCode":"610000","addressCountry":"CN"}},{"@type":"Article","headline":' + JSON.stringify(a.title) + ',"description":' + JSON.stringify(desc) + ',"inLanguage":"zh-CN","datePublished":"' + pub + '","dateModified":"' + pub + '","author":{"@type":"Organization","name":"成都高新心佑云端医疗美容诊所有限公司","url":"' + SITE + '/"},"publisher":{"@type":"Organization","name":"成都高新心佑云端医疗美容诊所有限公司","url":"' + SITE + '/"},"mainEntityOfPage":"' + SITE + '/knowledge/' + offEsc(a.slug) + '/"}' + faqLd + ']}</' + 'script>\n'
    + '<style>' + OFF_CSS + '</style></head>\n<body>\n'
    + '<nav><div class="nav-in"><div class="brand serif"><a href="/">心佑·云端 <b>医疗美容</b></a></div>'
    + '<div class="nav-links"><a href="/#about">机构介绍</a><a href="/#fields">服务领域</a><a href="/#projects">诊疗科目</a>'
    + '<a href="/#brands">合作品牌</a><a href="/#gallery">院内环境</a><a href="/knowledge/">科普专区</a><a href="/info/">机构信息</a></div></div></nav>\n'
    + '<div class="hero-sm"><div class="bgimg" style="background-image:url(\'/xinyou-site/img/xy-img-04.jpg\')"></div>'
    + '<div class="wrap-n"><div class="in"><div class="crumb"><a href="/">首页</a> / <a href="/knowledge/">科普专区</a></div>'
    + '<div class="en">Knowledge · Medical Aesthetics</div><h1>' + offEsc(a.title) + '</h1><div class="rule"></div></div></div></div>\n'
    + '<section><div class="wrap-n"><div class="article">'
    + conclHtml
    + offContentToHtml(a.content)
    + '<h2>延伸阅读</h2><div class="rel">' + rel + '</div>'
    + ext
    + infoLink
    + '</div></div></section>\n'
    + '<section style="background:var(--bg2)"><div class="wrap-n"><div class="contact-card">'
    + '<div class="c-row"><div class="k">机构名称</div><div class="v">成都高新心佑云端医疗美容诊所有限公司<small>品牌：心佑·云端（第 44 类注册商标）</small></div></div>'
    + '<div class="c-row"><div class="k">备案编号</div><div class="v">MA68J998651015D2212<small>成都高新技术产业开发区卫生健康局</small></div></div>'
    + '<div class="c-row"><div class="k">诊疗科目</div><div class="v">医疗美容科（美容外科、美容皮肤科）</div></div>'
    + '<div class="c-row"><div class="k">机构地址</div><div class="v">中国（四川）自由贸易试验区成都高新区府城大道西段505号1幢1单元24层2408号</div></div>'
    + '<div class="c-row"><div class="k">联系电话</div><div class="v">191-8081-1520<small>面诊请提前来电预约</small></div></div>'
    + '<div class="c-row"><div class="k">营业时间</div><div class="v">每日 10:00 - 22:00<small>周一至周日，法定节假日照常营业</small></div></div>'
    + '</div></div></section>\n'
    + '<footer><div class="f-in"><div class="f-name">心佑·云端 医疗美容诊所</div>'
    + '<div>用心雕琢美丽，守护每一份自信</div>'
    + '<div class="disc">本网站仅作机构客观信息展示与医美常识科普，不构成医疗建议、诊疗方案或任何效果表述；医疗美容须选择经卫生健康主管部门备案的正规机构，具体诊疗方案以执业医师面诊评估为准。</div>'
    + '</div></footer>\n'
    + OFF_PUSH + '\n</body></html>';
}

/** 图片代理：/kbimg/<name> → 转发工作台图片 */
async function proxyImage(req, env, ctx, filename) {
  const safe = /^[a-zA-Z0-9._-]+\.(jpg|jpeg|png)$/.test(filename || '');
  if (!safe) return new Response('bad name', { status: 400 });
  const upstream = WB_HOST + '/img/xinyou/' + filename + '?sharecode=' + SHARE;
  const r = await fetch(upstream, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) return new Response('upstream ' + r.status, { status: 404 });
  const buf = await r.arrayBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type': r.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=604800',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export async function onRequest(ctx) {
  const { request, env, next } = ctx;
  const url = new URL(request.url);

  // 图片代理：/knowledge/_img/<name>
  if (url.pathname.startsWith('/knowledge/_img/')) {
    return proxyImage(request, env, ctx, url.pathname.slice('/knowledge/_img/'.length));
  }

  // 文章页：/knowledge/<slug>/
  const m = url.pathname.match(/^\/knowledge\/([a-zA-Z0-9][a-zA-Z0-9-]*)\/?$/);
  if (!m) return next();
  const slug = m[1].toLowerCase();

  try {
    const qs = 'slug=eq.' + encodeURIComponent(slug) + '&select=slug,title,content,published_at,created_at&limit=1';
    const r = await fetch(DB_REST + '?' + qs, { headers: { 'x-wb-webapp-access-key': DB_KEY } });
    const list = await r.json();
    if (!Array.isArray(list) || !list.length) {
      return new Response('<!DOCTYPE html><meta charset="utf-8"><p>页面不存在</p><p><a href="/knowledge/">返回科普专区</a></p>', {
        status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    const html = offArticlePage(list[0]);
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=600',
        'X-Robots-Tag': 'index, follow'
      }
    });
  } catch (e) {
    return new Response('server error: ' + String(e && e.message || e).slice(0, 120), { status: 500 });
  }
}
