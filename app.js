(function(){
"use strict";
var L = SAS_LOGOS, CFG = window.SAS_CONFIG || {};
var S = JSON.parse(JSON.stringify(window.SAS_DEFAULT));
var state = JSON.parse(JSON.stringify(S));
var ui = { owner:false, assets:false, view:"home", month:null, modal:null, busy:false, editSummary:false, editGallery:false };
var app = document.getElementById("app");
var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
var DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function esc(s){ return String(s == null ? "" : s).replace(/[&<>\"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function pad(n){ return (n < 10 ? "0" : "") + n; }
function ymd(d){ return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate()); }
function parse(s){ var p = String(s).split("-"); return new Date(+p[0], +p[1]-1, +p[2]); }
function longDate(s){ var d = parse(s); return d.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"}); }
function today(){ return ymd(new Date()); }
function sorted(){ return state.meetings.slice().sort(function(a,b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }); }
function safeUrl(u){ return /^https:\/\//i.test(u || "") ? u : ""; }
function blobHref(p){ return encodeURI(p); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){} }

if(!ui.month){ var t = new Date(); ui.month = { y:t.getFullYear(), m:t.getMonth() }; }
var h = (location.hash || "").replace("#","");
if(h === "calendar" || h === "questions" || h === "home") ui.view = h;
window.addEventListener("hashchange", function(){ var v = location.hash.replace("#",""); if(v === "calendar" || v === "questions" || v === "home"){ ui.view = v; render(); window.scrollTo(0,0); } }[...]

/* ---------- toast ---------- */
var toastTimer;
function toast(msg){
  var el = document.getElementById("toast");
  if(!el){ el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role","status"); document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(function(){ el.hidden = true; }, 5000);
}

/* ---------- GitHub saving (owner only) ---------- */
var REPO = { o:"", r:"", b:"main", token:"" };
function repoInfo(){
  var o = CFG.owner, r = CFG.repo, b = CFG.branch || "main";
  if(!o){
    var m = location.hostname.match(/^([^.]+)\.github\.io$/);
    if(m){ o = m[1]; r = location.pathname.split("/")[1] || (o + ".github.io"); }
  }
  if(!o){ var saved = (lsGet("sas_repo") || "").split("/"); if(saved.length === 2){ o = saved[0]; r = saved[1]; } }
  return { o:o || "", r:r || "", b:b };
}
function utf8b64(str){ return btoa(unescape(encodeURIComponent(str))); }
function b64utf8(b){ return decodeURIComponent(escape(atob(b.replace(/\s/g,"")))); }
function fileB64(file){
  return new Promise(function(res, rej){
    var fr = new FileReader();
    fr.onload = function(){ res(String(fr.result).split(",")[1]); };
    fr.onerror = function(){ rej(new Error("Couldn't read that file.")); };
    fr.readAsDataURL(file);
  });
}
async function gh(path, opts){
  opts = opts || {};
  var res = await fetch("https://api.github.com/repos/" + REPO.o + "/" + REPO.r + path, {
    method: opts.method || "GET",
    headers: { "Authorization":"Bearer " + REPO.token, "Accept":"application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28", "Content-Type":"application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if(res.status === 401) throw Object.assign(new Error("GitHub rejected that token. Make a new one and try again."), { status:401 });
  if(res.status === 403) throw Object.assign(new Error("That token can't write to this repository. Give it Contents: read and write."), { status:403 });
  if(res.status === 404) throw Object.assign(new Error("Repository or file not found. Check the repo name and the token's access."), { status:404 });
  if(res.status === 409 || res.status === 422) throw Object.assign(new Error("The site changed while you were saving. Reload the page and try again."), { status:res.status });
  if(!res.ok) throw Object.assign(new Error("GitHub error " + res.status + ". Try again in a moment."), { status:res.status });
  return res.json();
}
async function putFile(path, b64, message){
  var sha;
  try{ var cur = await gh("/contents/" + path + "?ref=" + encodeURIComponent(REPO.b)); sha = cur.sha; }
  catch(e){ if(e.status !== 404) throw e; }
  return gh("/contents/" + path, { method:"PUT", body:{ message:message, content:b64, sha:sha, branch:REPO.b } });
}
async function enterOwner(o, r, token){
  REPO.o = o; REPO.r = r; REPO.token = token;
  var info = await gh("");
  if(!info.permissions || !info.permissions.push) throw new Error("That token can read this repository but not write to it.");
  REPO.b = CFG.branch || info.default_branch || "main";
  ui.owner = true; ui.assets = true;
  try{
    var f = await gh("/contents/data/site.json?ref=" + encodeURIComponent(REPO.b));
    state = JSON.parse(b64utf8(f.content)); S = JSON.parse(JSON.stringify(state));
  }catch(e){}
  render();
}
async function save(next, okMsg){
  if(ui.busy) return false;
  ui.busy = true; render();
  try{
    await putFile("data/site.json", utf8b64(JSON.stringify(next, null, 1)), "Update site content");
    state = next; S = JSON.parse(JSON.stringify(next));
    toast((okMsg || "Saved") + ". Visitors see it in about a minute.");
    return true;
  }catch(e){
    toast(e.message || "Couldn't save. Try again in a moment.");
    return false;
  }finally{ ui.busy = false; render(); }
}

// New: save the calendar (meetings) to a JSON file in /data so events can be edited by repository JSON.
async function saveCalendar(meetings, okMsg){
  if(ui.busy) return false;
  ui.busy = true; render();
  try{
    // Keep file shape flexible: store as an object with meetings array to match older expectations
    var payload = { meetings: meetings };
    await putFile("data/calender.json", utf8b64(JSON.stringify(payload, null, 1)), okMsg || "Update calendar");
    // Normalize and update local state and saved baseline S
    var normalized = (Array.isArray(meetings) ? meetings : []).filter(function(m){ return m && /^\d{4}-\d{2}-\d{2}$/.test(m.date || ""); }).map(normMeeting);
    state.meetings = normalized;
    S.meetings = JSON.parse(JSON.stringify(normalized));
    toast((okMsg || "Saved") + ". Visitors see it in about a minute.");
    return true;
  }catch(e){
    toast(e.message || "Couldn't save calendar. Try again in a moment.");
    return false;
  }finally{ ui.busy = false; render(); }
}

/* ---------- uploads (owner only) ---------- */
async function uploadPdf(file){
  if(!ui.owner) throw new Error("Sign in as owner to upload files.");
  if(file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) throw new Error("Background guides must be PDF files.");
  if(file.size > 20 * 1024 * 1024) throw new Error("That PDF is over 20 MB. Compress it and try again.");
  var safe = file.name.replace(/\.pdf$/i,"").replace(/[^A-Za-z0-9._-]+/g,"-").slice(0,60) || "guide";
  var path = "uploads/guides/" + uid() + "-" + safe + ".pdf";
  await putFile(path, await fileB64(file), "Add background guide");
  return { path:path, name:file.name };
}
function shrinkImage(file){
  return new Promise(function(res, rej){
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function(){
      var max = 1800, w = img.naturalWidth, hh = img.naturalHeight, k = Math.min(1, max / Math.max(w, hh));
      var c = document.createElement("canvas"); c.width = Math.round(w*k); c.height = Math.round(hh*k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(function(b){ b ? res(b) : rej(new Error("Couldn't read that image.")); }, "image/jpeg", 0.85);
    };
    img.onerror = function(){ URL.revokeObjectURL(url); rej(new Error("That file isn't an image this browser can open.")); };
    img.src = url;
  });
}
async function uploadImage(file){
  if(!ui.owner) throw new Error("Sign in as owner to upload files.");
  var b = await shrinkImage(file);
  var path = "uploads/photos/" + uid() + ".jpg";
  await putFile(path, await fileB64(b), "Add committee photo");
  return path;
}
function uploadErr(e){ return (e && e.message) || "Upload failed."; }

/* ---------- views ---------- */
var ICON_PHOTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="5" width="18" height="14"></rect><circle cx="9" cy="10" r="2"></c[...]
var GLOBE = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="16" cy="16" r="13"></circle><ellipse cx="16" cy="16" rx="5.5" ry="13"></e[...]
var WATERMARK = '<img class="watermark" src="' + L.un + '" alt="" aria-hidden="true">';

function clock(t){ if(!t) return ""; var p = t.split(":"), hh = +p[0], mm = p[1]; return ((hh % 12) || 12) + ":" + mm + " " + (hh < 12 ? "AM" : "PM"); }
function dateline(x){
  var d = parse(x.date), s = MONTHS[d.getMonth()].toUpperCase() + " " + d.getDate() + ", " + d.getFullYear();
  return x.time ? s + ", " + clock(x.time) + '<sup>CT</sup>' : s;
}
function soon(x){ var d = (parse(x.date) - parse(today())) / 864e5; return d >= 0 && d <= 7; }
function nextMeeting(){
  var t = today(), up = sorted().filter(function(m){ return m.date >= t; });
  return up[0] || null;
}
var EMAILS = {
  baron:{ name:"Baron Block", role:"Parent Communication", email:"baronblock32@sasaustin.org" },
  shoup:{ name:"J. Shoup", role:"Faculty Sponsor", email:"jshoup@sasaustin.org" }
};

function header(){
  function link(v, label){ return '<a href="#' + v + '"' + (ui.view === v ? ' aria-current="page"' : '') + '>' + label + '</a>'; }
  var nm = nextMeeting();
  var tick = nm ? '<span><span class="dot"></span>Next session</span><span>' + esc(nm.name) + '</span><span style="opacity:.65">' + dateline(nm) + '</span>'
                : '<span>No session scheduled</span>';
  return '<header class="mast"><div class="wrap">' +
      '<a class="brand" href="#home" aria-label="SAS MUN home">' + GLOBE + '<b>SAS <span>MUN</span></b></a>' +
      '<nav aria-label="Site">' + link("home","home") + link("calendar","calendar") + link("questions","questions") +
      '<a class="cta" href="#calendar">session calendar</a></nav>' +
    '</div></header>' +
    '<div class="ticker"><div class="wrap">' + tick + '</div></div>';
}
function footer(){
  function mail(p){ return '<li><strong style="font-weight:600;color:#fff">' + p.name + '</strong><br><span style="color:rgba(255,255,255,.55);font-size:.85rem">' + p.role + '</span><br><a class=[...]
  return '<div class="logo-band"><div class="wrap">' +
      '<img src="' + L.horiz + '" alt="St. Andrew\'s Episcopal School K-12">' +
      '<p>Middle School Model UN only. Not affiliated with the Upper School team or the United Nations.</p>' +
      '<img class="mono" src="' + L.monogram + '" alt="SAS monogram">' +
    '</div></div>' +
    '<footer><div class="wrap"><div class="cols">' +
      '<div><a class="brand" href="#home" style="color:#fff">' + GLOBE + '<b>SAS <span>MUN</span></b></a><p class="small" style="margin-top:14px">The Model United Nations program for middle schoo[...]
      '<div><h4>Program</h4><ul><li><a href="#home">Home</a></li><li><a href="#calendar">Session calendar</a></li><li><a href="#questions">Questions</a></li></ul></div>' +
      '<div><h4>Contact</h4><ul>' + mail(EMAILS.baron) + mail(EMAILS.shoup) + '</ul></div>' +
      '<div><h4>About</h4><ul><li>SAS Middle School Model UN</li><li>Grades 6–8</li><li><a href="#questions">Our team members</a></li></ul></div>' +
    '</div><div class="base">© ' + new Date().getFullYear() + ' St. Andrew\'s Episcopal School · Middle School Model United Nations</div></div></footer>';
}
function photoFrame(p, big){
  return p.path ? '<div class="frame filled"><img src="' + blobHref(p.path) + '" alt="' + esc(p.caption || "Committee photo") + '"' + (big ? '' : ' loading="lazy"') + '></div>'
              : '<div class="frame"><div>' + ICON_PHOTO + 'Photo placeholder<small>' + esc(p.caption) + '</small></div></div>';
}
function card(x, live){
  return '<article class="card' + (live ? ' live' : '') + '"><span class="cat">' + (live ? 'This week' : 'Committee session') + '</span>' +
    '<h3>' + esc(x.name) + '</h3><div class="date">' + dateline(x) + '</div>' +
    ((x.topic || x.chair) ? '<dl class="meta">' + (x.topic ? '<dt>Topic</dt><dd>' + esc(x.topic) + '</dd>' : '') + (x.chair ? '<dt>Chair</dt><dd>' + esc(x.chair) + '</dd>' : '') + '</dl>' : '') +
    '<button class="more" data-open="' + esc(x.id) + '">Session details →</button></article>';
}
var STAGES = [
  { cat:"Prepare", title:"Research a country", text:"Each delegate studies an assigned country and committee topic using the background guide." },
  { cat:"Debate", title:"Speak in caucus", text:"Moderated and unmoderated caucuses give delegates time to speak and negotiate for their country." },
  { cat:"Write", title:"Draft resolutions", text:"Blocs of delegates write and amend draft resolutions that propose real solutions." },
  { cat:"Decide", title:"Vote as a committee", text:"The committee votes on amendments and resolutions, and the chair announces the result." }
];

function homeView(){
  var nm = nextMeeting(), lead = state.photos[0];
  var dek;
  if(ui.editSummary){
    dek = '<form id="sumForm" style="margin-top:18px;display:flex;flex-direction:column;gap:10px"><label for="sumText">Program summary<span class="hint">Plain text. Line breaks are kept.</span><t[...]
      '<div class="row"><button class="btn btn-primary" type="submit"' + (ui.busy?' disabled':'') + '>' + (ui.busy?'Saving…':'Save summary') + '</button><button class="btn" type="button" data-a[...]
  } else if(state.summary){
    dek = '<p class="dek">' + esc(state.summary) + '</p>';
  } else {
    dek = '<p class="dek placeholder">Summary placeholder. Your introduction to SAS Middle School Model UN goes here: what the program is, who can join, when the club meets, and which conferences[...]
  }
  var upcoming = sorted().filter(function(m){ return m.date >= today(); }).slice(0, 6);
  var cards = upcoming.length ? '<div class="cards">' + upcoming.map(function(x){ return card(x, soon(x)); }).join("") + '</div>'
    : '<div class="empty">No sessions are on the calendar yet. New meetings show up here as soon as they are added.' + (ui.owner ? ' Use Add Meeting on the calendar page.' : '') + '</div>';

  var photos = state.photos.map(function(p, i){
    if(ui.editGallery){
      return '<figure class="photo">' + photoFrame(p) +
        '<label for="cap' + i + '">' + (i === 0 ? 'Lead photo caption' : 'Caption') + '<input id="cap' + i + '" type="text" value="' + esc(p.caption) + '"></label>' +
        '<label for="file' + i + '">' + (p.path ? 'Replace photo' : 'Add photo') + '<input id="file' + i + '" type="file" accept="image/*"></label>' +
        (p.path ? '<button type="button" class="btn btn-sm" data-clearphoto="' + i + '">Remove photo</button>' : '') + '</figure>';
    }
    if(i === 0) return "";
    return '<figure class="photo">' + photoFrame(p) + '<figcaption>' + esc(p.caption) + '</figcaption></figure>';
  }).join("");

  return '<section class="hero dark">' + WATERMARK + '<div class="wrap">' +
      '<div><span class="kicker-strip">St. Andrew\'s Episcopal School · Middle School</span>' +
        '<h1>Model United <em>Nations</em></h1>' +
        '<div class="dateline">Austin, Texas · Grades 6–8 · Middle School program only</div>' +
        '<dl class="byline"><dt>Program:</dt><dd>SAS Middle School Model UN</dd><dt>Sponsor:</dt><dd class="u">J. Shoup</dd></dl>' +
        dek +
        (ui.owner && !ui.editSummary ? '<div class="row" style="margin-top:16px"><button class="btn btn-sm" data-act="editSummary">Edit summary</button></div>' : '') +
      '</div>' +
      '<div class="lead-media">' + photoFrame(lead, true) + '<img class="seal-stamp" src="' + L.seal + '" alt="Seal of Saint Andrew\'s Episcopal School, 1952"></div>' +
    '</div></section>' +
    '<section class="band"><div class="wrap"><div class="section-label"><div><span class="eyebrow">On the calendar</span><h2>Upcoming sessions</h2></div><a class="btn btn-sm" href="#calendar">ful[...]
    '<section class="band alt"><div class="wrap"><div class="section-label"><div><span class="eyebrow">Inside a committee</span><h2>How a session works</h2><p>Every committee follows the same pat[...]
      '<div class="cards four">' + STAGES.map(function(s){ return '<article class="card"><span class="cat">' + s.cat + '</span><h3>' + s.title + '</h3><p>' + s.text + '</p></article>'; }).join(""[...]
    '<section class="band"><div class="wrap"><div class="section-label"><div><span class="eyebrow">Photos</span><h2>From the committee room</h2></div>' +
      (ui.owner && !ui.editGallery ? '<button class="btn btn-sm" data-act="editGallery">Edit photos</button>' : '') + '</div>' +
      (ui.editGallery ? '<form id="galForm"><div class="photo-feed">' + photos + '</div><p class="err" id="galErr"></p><div class="row"><button class="btn btn-primary" type="submit"' + (ui.busy?'[...]
                      : '<div class="photo-feed">' + photos + '</div>') +
    '</div></section>' +
    '<section class="band tint cta-band"><div class="wrap"><div><h2>Have a question?</h2><p>Parents can reach our parent communication lead, and our faculty sponsor is always available.</p></div>[...]
}

function calendarView(){
  var y = ui.month.y, m = ui.month.m;
  var first = new Date(y, m, 1), start = new Date(y, m, 1 - first.getDay());
  var byDate = {};
  sorted().forEach(function(x){ (byDate[x.date] = byDate[x.date] || []).push(x); });
  var t = today(), cells = DOW.map(function(d){ return '<div class="dow">' + d + '</div>'; }).join("");
  var weeks = Math.ceil((first.getDay() + new Date(y, m+1, 0).getDate()) / 7);
  for(var i = 0; i < weeks * 7; i++){
    var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), k = ymd(d);
    var cls = "day" + (d.getMonth() !== m ? " out" : "") + (k === t ? " today" : "");
    var chips = (byDate[k] || []).map(function(x){ return '<button class="chip" data-open="' + esc(x.id) + '" title="' + esc(x.name) + '">' + esc(x.name) + '</button>'; }).join("");
    var add = ui.owner ? '<button class="add" data-add="' + k + '" aria-label="Add meeting on ' + esc(longDate(k)) + '">+</button>' : '';
    cells += '<div class="' + cls + '"><div class="num"><span>' + d.getDate() + '</span>' + add + '</div>' + chips + '</div>';
  }
  var key = y + "-" + pad(m+1);
  var monthItems = sorted().filter(function(x){ return x.date.slice(0,7) === key; });
  var agenda = monthItems.length ? monthItems.map(function(x){ return card(x, soon(x)); }).join("") : '<div class="empty">No meetings in ' + MONTHS[m] + '.' + (ui.owner ? ' Use Add Meeting to sch[...]
  if(ui.calError) agenda = '<div class="empty" style="border-color:#c0392b">The calendar file could not be read. Check data/calendar.json or data/calender.json for a missing comma, quote or bracket.</div>' + agenda;
  var upcoming = sorted().filter(function(x){ return x.date >= t && x.date.slice(0,7) !== key; }).slice(0,3);

  return '<section class="page-head dark"><div class="wrap"><div><span class="kicker-strip">Session calendar</span><h1>Meetings &amp; committees</h1><p>Select a meeting for its topic, chair, back[...]
      (ui.owner ? '<div class="row"><span class="owner-flag">● Editing as owner</span><button class="btn btn-primary" data-add="' + (key === t.slice(0,7) ? t : key + "-01") + '">+ Add Meeting</[...]
    '</div></section>' +
    '<section class="band alt"><div class="wrap"><div class="cal-shell"><div><div class="cal-bar"><h2>' + MONTHS[m] + ' ' + y + '</h2>' +
      '<button class="btn btn-sm" data-act="prev" aria-label="Previous month">‹ prev</button><button class="btn btn-sm" data-act="thisMonth">today</button><button class="btn btn-sm" data-act="n[...]
      '<div class="cal-grid">' + cells + '</div></div>' +
      '<div class="agenda"><h2>' + MONTHS[m] + '</h2>' + agenda +
        (upcoming.length ? '<h2 style="margin-top:12px">Coming up</h2>' + upcoming.map(function(x){ return card(x, soon(x)); }).join("") : '') +
      '</div></div></div></section>';
}

function mailRow(email){
  return '<span class="copy-line"><a class="u" href="mailto:' + esc(email) + '">' + esc(email) + '</a><button class="btn btn-sm" data-copy="' + esc(email) + '">copy</button></span>';
}
function questionsView(){
  var leads = [
    { p:EMAILS.baron, note:"Questions from parents and families about schedules, conferences and logistics." },
    { p:EMAILS.shoup, note:"Faculty oversight of the middle school Model UN program." }
  ];
  var team = [
    { name:"Saharsh Gade", email:"saharshgade32@sasaustin.org" },
    { name:"Brody Braun", email:"braunbrody32@sasaustin.org" },
    { name:"James Berg", email:"jamesberg32@sasaustin.org" },
    { name:"William Spong", email:"williamspong32@sasaustin.org" }
  ];
  return '<section class="page-head dark"><div class="wrap"><div><span class="kicker-strip">Questions</span><h1>Who to contact</h1><p>Email whoever fits your question. Tap an address to open your[...]
    '<section class="band alt"><div class="wrap"><div class="people">' + leads.map(function(l){ return '<div class="person"><span class="role">' + l.p.role + '</span><h2>' + l.p.name + '</h2><p>'[...]
    '<section class="band"><div class="wrap"><div class="tabs"><span>Our other team members</span></div>' +
    '<div class="people team">' + team.map(function(p){ return '<div class="person"><h2>' + p.name + '</h2>' + mailRow(p.email) + '</div>'; }).join("") + '</div></div></section>';
}

/* ---------- dialogs ---------- */
function find(id){ for(var i = 0; i < state.meetings.length; i++) if(state.meetings[i].id === id) return state.meetings[i]; return null; }
function detailDialog(x){
  var guide = x.guide ? '<a class="btn btn-primary" href="' + blobHref(x.guide.path) + '" target="_blank" rel="noopener">Background guide (PDF)</a>' : '<span style="color:var(--dim)">Background g[...]
  var sheet = safeUrl(x.sheet) ? '<a class="btn" href="' + esc(x.sheet) + '" target="_blank" rel="noopener">Country assignments ↗</a>' : '<span style="color:var(--dim)">Country assignments not [...]
  var ownerFoot = ui.owner ? (ui.modal.confirm
      ? '<div class="confirm"><span>Delete “' + esc(x.name) + '”? It disappears from the calendar for everyone.</span><button class="btn btn-danger btn-sm" data-act="reallyDelete"' + (ui.busy[...]
      : '<button class="btn btn-danger" data-act="askDelete">Delete</button><button class="btn btn-primary" data-edit="' + esc(x.id) + '">Edit meeting</button>') : '';
  return '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlgTitle"><div class="dialog-head"><div><span class="kicker-strip">' + (soon(x) ? 'This week' : 'Session') + '</span[...]
    '<div class="dialog-body"><dl class="byline">' +
      '<dt>Topic:</dt><dd>' + (esc(x.topic) || '—') + '</dd>' +
      '<dt>Chair:</dt><dd>' + (esc(x.chair) || '—') + '</dd>' +
      '<dt>Email:</dt><dd>' + (x.email ? mailRow(x.email) : '—') + '</dd>' +
    '</dl><div class="res">' + guide + sheet + '</div></div>' +
    (ownerFoot ? '<div class="dialog-foot">' + ownerFoot + '</div>' : '') + '</div>';
}
function formDialog(x){
  var v = x || { date: ui.modal.date || today(), time:"", name:"", topic:"", chair:"", email:"", sheet:"", guide:null };
  return '<form class="dialog" id="mtgForm" role="dialog" aria-modal="true" aria-labelledby="dlgTitle" novalidate><div class="dialog-head"><div><span class="kicker-strip">Owner only</span><h2 id=[...]
    '<div class="dialog-body"><div class="form-grid">' +
      '<label for="f_date">Date<input id="f_date" type="date" required value="' + esc(v.date) + '"></label>' +
      '<label for="f_time">Start time<span class="hint">Optional</span><input id="f_time" type="time" value="' + esc(v.time || "") + '"></label>' +
      '<label class="full" for="f_name">Meeting name<span class="hint">Shown under the date</span><input id="f_name" type="text" required maxlength="80" value="' + esc(v.name) + '" placeholder="U[...]
      '<label class="full" for="f_topic">Topic<input id="f_topic" type="text" maxlength="160" value="' + esc(v.topic) + '" placeholder="Water security in the Nile basin"></label>' +
      '<label for="f_chair">Committee chair<input id="f_chair" type="text" maxlength="80" value="' + esc(v.chair) + '"></label>' +
      '<label for="f_email">Chair email<input id="f_email" type="email" maxlength="120" value="' + esc(v.email) + '" placeholder="name@sasaustin.org"></label>' +
      '<label class="full" for="f_pdf">Background guide<span class="hint">PDF only' + (v.guide ? '. Current file: ' + esc(v.guide.name) + '. Choose a new PDF to replace it.' : '') + '</span><inpu[...]
      (v.guide ? '<label class="full" style="flex-direction:row;align-items:center;text-transform:none;letter-spacing:0;font-weight:400;font-size:.92rem"><input id="f_rmpdf" type="checkbox"> Remo[...]
      '<label class="full" for="f_sheet">Country assignments<span class="hint">Google Sheet link. Set sharing to “Anyone with the link can view.”</span><input id="f_sheet" type="url" value="'[...]
    '</div><p class="err" id="formErr"></p></div>' +
    '<div class="dialog-foot"><button type="button" class="btn" data-act="close">Cancel</button><button type="submit" class="btn btn-primary"' + (ui.busy?' disabled':'') + '>' + (ui.busy ? 'Savin[...]
}
function loginDialog(){
  var r = repoInfo(), val = r.o ? r.o + "/" + r.r : "";
  return '<form class="dialog" id="loginForm" role="dialog" aria-modal="true" aria-labelledby="dlgTitle" novalidate><div class="dialog-head"><div><span class="kicker-strip">Owner only</span><h2 i[...]
    '<div class="dialog-body"><p style="margin:0;color:var(--dim)">Paste a GitHub fine-grained token that has <strong>Contents: read and write</strong> for this repository only. It is kept in thi[...]
    '<div class="form-grid"><label class="full" for="l_repo">Repository<input id="l_repo" type="text" value="' + esc(val) + '" placeholder="owner/repo"></label>' +
    '<label class="full" for="l_token">GitHub token<input id="l_token" type="password" autocomplete="off" placeholder="github_pat_…"></label></div><p class="err" id="loginErr"></p></div>' +
    '<div class="dialog-foot"><button type="button" class="btn" data-act="close">Cancel</button><button type="submit" class="btn btn-primary">Sign in</button></div></form>';
}
function modalHtml(){
  if(!ui.modal) return "";
  var inner = "";
  if(ui.modal.kind === "detail"){ var x = find(ui.modal.id); if(!x){ ui.modal = null; return ""; } inner = detailDialog(x); }
  else if(ui.modal.kind === "login") inner = loginDialog();
  else inner = formDialog(ui.modal.id ? find(ui.modal.id) : null);
  return '<div class="scrim" data-scrim="1">' + inner + '</div>';
}

/* ---------- render ---------- */
function render(){
  var keep = {};
  app.querySelectorAll("input[id],textarea[id]").forEach(function(el){ if(el.type !== "file") keep[el.id] = el.type === "checkbox" ? el.checked : el.value; });
  var files = {};
  app.querySelectorAll("input[type=file]").forEach(function(el){ if(el.files && el.files.length) files[el.id] = el.files; });
  var body = ui.view === "calendar" ? calendarView() : ui.view === "questions" ? questionsView() : homeView();
  app.innerHTML = header() + '<main class="view">' + body + '</main>' + footer() + modalHtml();
  Object.keys(keep).forEach(function(id){ var el = document.getElementById(id); if(el){ if(el.type === "checkbox") el.checked = keep[id]; else el.value = keep[id]; } });
  Object.keys(files).forEach(function(id){ var el = document.getElementById(id); if(el){ try{ el.files = files[id]; }catch(e){} } });
}

/* ---------- events ---------- */
app.addEventListener("click", async function(e){
  var t = e.target.closest("[data-act],[data-open],[data-add],[data-edit],[data-copy],[data-clearphoto],[data-scrim]");
  if(!t) return;
  if(t.dataset.scrim && e.target !== t) return;
  if(t.dataset.scrim){ if(!ui.busy){ ui.modal = null; render(); } return; }
  if(t.dataset.open){ ui.modal = { kind:"detail", id:t.dataset.open }; render(); return; }
  if(t.dataset.add){ if(ui.owner){ ui.modal = { kind:"form", date:t.dataset.add }; render(); var f = document.getElementById("f_name"); if(f) f.focus(); } return; }
  if(t.dataset.edit){ ui.modal = { kind:"form", id:t.dataset.edit }; render(); return; }
  if(t.dataset.copy){
    var val = t.dataset.copy;
    try{ await navigator.clipboard.writeText(val); toast("Copied " + val); }
    catch(err){ var a = t.parentNode.querySelector("a"); if(a){ var r = document.createRange(); r.selectNodeContents(a); var s = getSelection(); s.removeAllRanges(); s.addRange(r); } toast("Press[...]
    return;
  }
  if(t.dataset.clearphoto){ var i = +t.dataset.clearphoto; collectCaptions(); state.photos[i].path = null; state.photos[i]._cleared = true; render(); return; }
  var act = t.dataset.act;
  if(act === "close"){ if(!ui.busy){ ui.modal = null; render(); } }
  else if(act === "ownerLogin"){ ui.modal = { kind:"login" }; render(); var tk = document.getElementById("l_token"); if(tk) tk.focus(); }
  else if(act === "ownerLogout"){ lsDel("sas_gh_token"); ui.owner = false; ui.assets = false; ui.editSummary = false; ui.editGallery = false; ui.modal = null; render(); toast("Signed out of owner[...]
  else if(act === "prev"){ ui.month.m--; if(ui.month.m < 0){ ui.month.m = 11; ui.month.y--; } render(); }
  else if(act === "next"){ ui.month.m++; if(ui.month.m > 11){ ui.month.m = 0; ui.month.y++; } render(); }
  else if(act === "thisMonth"){ var n = new Date(); ui.month = { y:n.getFullYear(), m:n.getMonth() }; render(); }
  else if(act === "askDelete"){ ui.modal.confirm = true; render(); }
  else if(act === "noDelete"){ ui.modal.confirm = false; render(); }
  else if(act === "reallyDelete"){
    var id = ui.modal.id, next = JSON.parse(JSON.stringify(S));
    next.meetings = next.meetings.filter(function(m){ return m.id !== id; });
    // Save meetings to the calendar JSON file in /data
    if(await saveCalendar(next.meetings, "Meeting deleted")){ ui.modal = null; render(); }
  }
  else if(act === "editSummary"){ ui.editSummary = true; render(); var ta = document.getElementById("sumText"); if(ta) ta.focus(); }
  else if(act === "cancelSummary"){ ui.editSummary = false; render(); }
  else if(act === "editGallery"){ ui.editGallery = true; render(); }
  else if(act === "cancelGallery"){ ui.editGallery = false; state = JSON.parse(JSON.stringify(S)); render(); }
});
document.addEventListener("keydown", function(e){ if(e.key === "Escape" && ui.modal && !ui.busy){ ui.modal = null; render(); } });

function collectCaptions(){
  state.photos.forEach(function(p, i){ var c = document.getElementById("cap" + i); if(c) p.caption = c.value.trim(); });
}

app.addEventListener("submit", async function(e){
  e.preventDefault();
  var f = e.target;
  if(f.id === "loginForm"){
    var lerr = document.getElementById("loginErr");
    var rp = document.getElementById("l_repo").value.trim().replace(/^https?:\/\/github\.com\//i,"").replace(/\/$/,"").split("/");
    var tok = document.getElementById("l_token").value.trim();
    if(rp.length < 2 || !rp[0] || !rp[1]){ lerr.textContent = "Enter the repository as owner/repo."; return; }
    if(!tok){ lerr.textContent = "Paste your GitHub token."; return; }
    lerr.textContent = "Checking…";
    try{ await enterOwner(rp[0], rp[1].replace(/\.git$/,""), tok); lsSet("sas_repo", rp[0] + "/" + rp[1]); lsSet("sas_gh_token", tok); ui.modal = null; render(); toast("Owner editing is on"); }
    catch(ex){ lerr.textContent = ex.message || "Sign-in failed."; }
    return;
  }
  if(f.id === "sumForm"){
    var next = JSON.parse(JSON.stringify(S));
    next.summary = document.getElementById("sumText").value.trim();
    if(await save(next, "Summary saved")){ ui.editSummary = false; render(); }
    return;
  }
  if(f.id === "galForm"){
    var errEl = document.getElementById("galErr");
    collectCaptions();
    var next2 = JSON.parse(JSON.stringify(S));
    ui.busy = true;
    try{
      for(var i = 0; i < state.photos.length; i++){
        next2.photos[i].caption = state.photos[i].caption;
        if(state.photos[i]._cleared) next2.photos[i].path = null;
        var inp = document.getElementById("file" + i);
        if(inp && inp.files && inp.files[0]){ errEl.textContent = "Uploading photo " + (i+1) + "…"; next2.photos[i].path = await uploadImage(inp.files[0]); }
      }
    }catch(err){ ui.busy = false; errEl.textContent = uploadErr(err); return; }
    ui.busy = false;
    if(await save(next2, "Photos saved")){ ui.editGallery = false; render(); }
    return;
  }
  if(f.id === "mtgForm"){
    var err = document.getElementById("formErr");
    var v = function(id){ return (document.getElementById(id).value || "").trim(); };
    var rec = { date:v("f_date"), time:v("f_time"), name:v("f_name"), topic:v("f_topic"), chair:v("f_chair"), email:v("f_email"), sheet:v("f_sheet") };
    if(!/^\d{4}-\d{2}-\d{2}$/.test(rec.date)){ err.textContent = "Pick a date for the meeting."; return; }
    if(!rec.name){ err.textContent = "Give the meeting a name. It appears under the date."; return; }
    if(rec.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rec.email)){ err.textContent = "The chair email doesn't look like an email address."; return; }
    if(rec.sheet && !/^https:\/\//i.test(rec.sheet)){ err.textContent = "The country assignments link must start with https://"; return; }
    if(rec.sheet && !/docs\.google\.com\/spreadsheets/i.test(rec.sheet)){ err.textContent = "That link isn't a Google Sheet. Paste the link from the sheet's Share button."; return; }
    var nextM = JSON.parse(JSON.stringify(S));
    var existing = ui.modal.id ? nextM.meetings.filter(function(m){ return m.id === ui.modal.id; })[0] : null;
    rec.guide = existing ? existing.guide || null : null;
    var rm = document.getElementById("f_rmpdf"); if(rm && rm.checked) rec.guide = null;
    var pdf = document.getElementById("f_pdf");
    if(pdf && pdf.files && pdf.files[0]){
      ui.busy = true; err.textContent = "Uploading background guide…";
      try{ rec.guide = await uploadPdf(pdf.files[0]); }
      catch(ex){ ui.busy = false; err.textContent = uploadErr(ex); return; }
      ui.busy = false; err.textContent = "";
    }
    if(existing){ rec.id = existing.id; nextM.meetings = nextM.meetings.map(function(m){ return m.id === rec.id ? rec : m; }); }
    else { rec.id = uid(); nextM.meetings.push(rec); }
    var d = parse(rec.date); ui.month = { y:d.getFullYear(), m:d.getMonth() };
    // Save meetings to data/calender.json so the calendar is driven by a JSON file in /data
    if(await saveCalendar(nextM.meetings, existing ? "Meeting updated" : "Meeting added")){ ui.modal = { kind:"detail", id:rec.id }; render(); }
  }
});


/* ---------- boot ---------- */
function normMeeting(m, i){
  var g = m.guide;
  if(typeof g === "string" && g){ g = { path:g, name:g.split("/").pop() }; }
  else if(!(g && typeof g === "object" && g.path)){ g = null; }
  return { id: m.id || ("m" + i), date:String(m.date || ""), time:String(m.time || ""), name:String(m.name || "Untitled meeting"), topic:String(m.topic || ""), chair:String(m.chair || ""), email:String(m.email || ""), sheet:String(m.sheet || ""), guide:g };
}
render();
(async function(){
  try{
    var res = await fetch("data/site.json?t=" + Date.now(), { cache:"no-store" });
    if(res.ok){ var d = await res.json(); state.summary = d.summary || ""; state.photos = d.photos || state.photos; }
  }catch(e){}
  try{
    // Try the more-correct filename first (calendar.json), fall back to the historically-misspelled calender.json
    var rc = await fetch("data/calendar.json?t=" + Date.now(), { cache:"no-store" });
    if(!rc.ok) rc = await fetch("data/calender.json?t=" + Date.now(), { cache:"no-store" });
    if(rc.ok){
      var c = await rc.json();
      var list = Array.isArray(c) ? c : (c.meetings || []);
      state.meetings = list.filter(function(m){ return m && /^\d{4}-\d{2}-\d{2}$/.test(m.date || ""); }).map(normMeeting);
    }
  }catch(e){ ui.calError = true; }
  render();
})();
})();
