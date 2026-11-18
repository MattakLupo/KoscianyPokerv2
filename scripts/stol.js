// Stol do gry: okno otwarte przez caly mecz na ekranie Mistrza Gry i kazdego gracza.
// Pokazuje miejsca graczy, ich kosci (jawne, ukryte albo odkryte), pule, kto teraz gra i animacje rzutow.
// Tajne kosci NIGDY nie sa wysylane do wszystkich: ukryta reke widzi tylko jej wlasciciel (osobne zapytanie) i MG.
import { esc, rysujKoscHTML, pozycjeMiejsc, rozmiarImienia, ocenUklad, bezpiecznyObraz, OBRAZ_ZASTEPCZY, ID_MODULU } from "./wspolne.js";
import { KOLORY_CHIP, stolWarstwyHTML } from "./ekran.js";

export const STOL_W = 1360;
export const STOL_H = 800;
export const STOL_CENTRUM_Y = 400;
export const MIEJSCE_W = 170;
export const MIEJSCE_H = 70;
export const STOL_PROMIEN_X = 585;
export const STOL_PROMIEN_Y = 345;
export const TACA_PROMIEN_X = 330;
export const TACA_PROMIEN_Y = 200;
export const SRODEK_W = 280;
export const SRODEK_H = 230;
// Panel historii zdarzen w lewym dolnym rogu sceny (lewy, gorny, szerokosc, wysokosc)
export const HISTORIA_L = 8;
export const HISTORIA_T = 688;
export const HISTORIA_W = 220;
export const HISTORIA_H = 104;
export const STOL_MAX_MIEJSC = 8;

const TYPY = ["done", "now", "wait", "pas", "out"];
export const DZWIEKI = { kosci: "kosci.wav", zetony: "zetony.wav", gong: "gong.wav" };
export const TEMPO_ANIMACJI = { szybko: 0.65, normalnie: 1, wolno: 1.5 };

// Ustawienie klienta (kazdy gracz ma wlasne): bledy odczytu i brak ustawienia daja wartosc domyslna
export function ustawienieKlienta(klucz, domyslne) {
  try {
    if (typeof game === "undefined" || !game.settings || typeof game.settings.get !== "function") return domyslne;
    const v = game.settings.get(ID_MODULU, klucz);
    return (v === undefined || v === null) ? domyslne : v;
  } catch (err) {
    return domyslne;
  }
}

// Odtwarza dzwiek modulu tylko na tym komputerze (poza meczem i przy wylaczonych dzwiekach: cisza)
export function zagrajDzwiek(typ) {
  try {
    const plik = DZWIEKI[typ];
    if (!plik || ustawienieKlienta("dzwieki", true) === false) return false;
    const glosnosc = Math.min(1, Math.max(0, Number(ustawienieKlienta("glosnoscDzwiekow", 0.6))));
    if (!(glosnosc > 0)) return false;
    const audio = typeof foundry !== "undefined" && foundry.audio && foundry.audio.AudioHelper;
    if (!audio || typeof audio.play !== "function") return false;
    audio.play({ src: "modules/" + ID_MODULU + "/sounds/" + plik, volume: glosnosc, loop: false, autoplay: true }, false);
    return true;
  } catch (err) {
    return false;
  }
}
const TRYBY = ["brak", "jawne", "ukryte", "odkryte", "pas", "out"];

const bezTagow = (t, max) => String(t == null ? "" : t).replace(/<[^>]*>/g, "").slice(0, max || 200);
const tylkoStrong = (t) => String(t == null ? "" : t).replace(/<(?!\/?strong>)[^>]*>/g, "").slice(0, 400);

function liczba(v, min, max, domyslna) {
  const n = Number(v);
  if (!Number.isInteger(n)) return domyslna;
  return Math.min(max, Math.max(min, n));
}

function kosciLista(v) {
  if (!Array.isArray(v)) return null;
  const w = v.slice(0, 5).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 6);
  return w.length > 0 ? w : null;
}

// Dane stolu przychodza przez siec: zostawiamy tylko dozwolone pola. zachowajReki: tylko dla lokalnego stanu MG.
export function oczyscStol(s, opcje) {
  if (!s || typeof s !== "object") return null;
  const zachowajReki = Boolean(opcje && opcje.zachowajReki);
  const miejsca = (Array.isArray(s.miejsca) ? s.miejsca : []).slice(0, STOL_MAX_MIEJSC).map((m0) => {
    const m = m0 && typeof m0 === "object" ? m0 : {};
    const tryb = TRYBY.includes(m.tryb) ? m.tryb : "brak";
    const jawne = tryb === "jawne" || tryb === "odkryte";
    return {
      nazwa: String(m.nazwa == null ? "" : m.nazwa).slice(0, 60),
      token: bezpiecznyObraz(m.token),
      wplacono: bezTagow(m.wplacono, 40),
      allIn: Boolean(m.allIn),
      podbil: Boolean(m.podbil),
      userId: m.userId ? String(m.userId).slice(0, 40) : null,
      typ: TYPY.includes(m.typ) ? m.typ : "wait",
      tekst: bezTagow(m.tekst, 40),
      tryb: tryb,
      kosci: jawne ? kosciLista(m.kosci) : null, // ukryte kosci nigdy nie sa wyswietlane z danych publicznych
      ukryte: tryb === "ukryte" ? liczba(m.ukryte, 0, 5, 5) : 0,
      uklad: bezTagow(m.uklad, 60),
      zwyciezca: Boolean(m.zwyciezca)
    };
  });
  const a = s.animacja && typeof s.animacja === "object" ? s.animacja : null;
  const wynik = {
    mecz: String(s.mecz == null ? "" : s.mecz).slice(0, 40),
    etykieta: bezTagow(s.etykieta, 120),
    rola: bezTagow(s.rola, 60),
    imie: String(s.imie == null ? "" : s.imie).slice(0, 80),
    nastepnyHTML: tylkoStrong(s.nastepnyHTML),
    pula: bezTagow(s.pula, 60),
    komunikat: bezTagow(s.komunikat, 200),
    historia: (Array.isArray(s.historia) ? s.historia : []).slice(-5).map((h) => bezTagow(h, 110)).filter((h) => h !== ""),
    koniec: Boolean(s.koniec),
    dzwiek: s.dzwiek && typeof s.dzwiek === "object" && Object.keys(DZWIEKI).includes(s.dzwiek.typ)
      ? { id: String(s.dzwiek.id == null ? "" : s.dzwiek.id).slice(0, 40), typ: s.dzwiek.typ } : null,
    miejsca: miejsca,
    animacja: a ? {
      id: String(a.id == null ? "" : a.id).slice(0, 40),
      miejsce: liczba(a.miejsce, 0, STOL_MAX_MIEJSC - 1, 0),
      rodzaj: a.rodzaj === "wymiana" ? "wymiana" : "rzut",
      ile: liczba(a.ile, 0, 8, 0),
      indeksy: (Array.isArray(a.indeksy) ? a.indeksy : []).map(Number).filter((n, i, t) => Number.isInteger(n) && n >= 0 && n <= 4 && t.indexOf(n) === i).slice(0, 5)
    } : null
  };
  if (zachowajReki && s.rekiMG && typeof s.rekiMG === "object") {
    wynik.rekiMG = {};
    for (const [k, v] of Object.entries(s.rekiMG)) {
      const lista = kosciLista(v);
      if (lista) wynik.rekiMG[String(k)] = lista;
    }
  }
  return wynik;
}

// Rozmiar kosci na stole zalezy od liczby graczy (im wiecej miejsc, tym mniejsze kosci)
export const rozmiarKosciStolu = (n) => (n <= 2 ? 54 : n <= 4 ? 44 : n <= 6 ? 38 : n === 7 ? 32 : 30);

const losowa = (a, b) => {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// Wymiary tacy (pola na suknie przed graczem, na ktorym leza jego kosci)
export function rozmiarTacy(n) {
  const s = rozmiarKosciStolu(n);
  const skok = s * 1.04;
  return { w: Math.round(2 * (2 * skok + s * 0.05 + s * 0.68)), h: Math.round(2 * (s * 0.24 + s * 0.68)) };
}

// Ulozenie kosci na tacy: ten sam gracz i numer kosci zawsze daja to samo "rozrzucenie" (nic nie skacze przy odswiezeniu)
export function ukladTacy(n, i, ile) {
  const s = rozmiarKosciStolu(n);
  const skok = s * 1.04;
  const kosci = [];
  for (let j = 0; j < ile; j++) {
    kosci.push({
      x: Math.round((j - (ile - 1) / 2) * skok + (losowa(i + 1, j + 1) - 0.5) * s * 0.1),
      y: Math.round((j % 2 ? 1 : -1) * s * 0.16 + (losowa(j + 7, i + 3) - 0.5) * s * 0.16),
      rot: Math.round((losowa(i + 5, j + 2) - 0.5) * 50)
    });
  }
  return { s: s, kosci: kosci };
}

// Jedna kosc na tacy. el: {v: oczka} albo {tyl: true}. dx, dy: przesuniecie z miejsca gracza (start rzutu)
function koscNaTacyHTML(el, k, s, w, h, dx, dy) {
  const wspolne = 'data-px="' + s + '" data-dx="' + dx + '" data-dy="' + dy + '" data-rot="' + k.rot + '" style="position:absolute; left:' + Math.round(w / 2 + k.x - s / 2) + 'px; top:' + Math.round(h / 2 + k.y - s / 2) + 'px; ' +
    'width:' + s + 'px; height:' + s + 'px; transform:rotate(' + k.rot + 'deg);';
  if (el.tyl) {
    return '<span class="kp-tyl" ' + wspolne + ' box-sizing:border-box; border-radius:' + Math.round(s * 0.2) + 'px; border:2px solid #2a1809; ' +
      'background:repeating-linear-gradient(45deg, #7a2f2f, #7a2f2f 4px, #521f1f 4px, #521f1f 8px); box-shadow:0 3px 7px rgba(0,0,0,0.65);"></span>';
  }
  return '<span class="kp-kosc" ' + wspolne + ' filter:drop-shadow(0 3px 4px rgba(0,0,0,0.6));">' + rysujKoscHTML(el.v, true, s) + '</span>';
}

function tacaHTML(m, i, n, dane, sp, tp) {
  const rozm = rozmiarTacy(n);
  const uk = ukladTacy(n, i, dane.kosci.length);
  let dice = "";
  dane.kosci.forEach((el, j) => {
    const k = uk.kosci[j];
    dice += koscNaTacyHTML(el, k, uk.s, rozm.w, rozm.h, Math.round(sp.x - tp.x - k.x), Math.round(sp.y - tp.y - k.y));
  });
  const zw = Boolean(m.zwyciezca);
  const ramka = zw ? "border:2px solid #ffd966; background:rgba(255,217,102,0.12); box-shadow:0 0 30px #ffd966, inset 0 0 18px rgba(255,217,102,0.35);" : "border:1px dashed rgba(255,243,196,0.25); background:rgba(0,0,0,0.12);";
  const podpis = dane.podpis ? '<div class="kp-podpis" style="position:absolute; left:50%; top:100%; transform:translateX(-50%); margin-top:-2px; max-width:300px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; ' +
    'font-size:12px; line-height:16px; padding:1px 9px; border-radius:9px; background:rgba(0,0,0,0.6); color:' + (zw ? "#ffd966" : "#f0e6d2") + ';">' + esc(dane.podpis) + '</div>' : "";
  const zeton = m.podbil
    ? '<span class="kp-zeton" title="Podbił stawkę" style="position:absolute; z-index:2; right:6px; top:4px; width:22px; height:22px; box-sizing:border-box; border-radius:50%; border:3px dashed #fff3c4; background:radial-gradient(circle at 35% 30%, #ffe08a, #c9921a 70%); box-shadow:0 2px 5px rgba(0,0,0,0.7), 0 0 0 1px #6b4a0a; color:#5a3a05; font-size:12px; font-weight:bold; line-height:16px; text-align:center;">+</span>'
    : "";
  return '<div class="kp-taca" data-i="' + i + '" style="position:absolute; z-index:5; left:' + (STOL_W / 2 + tp.x) + 'px; top:' + (STOL_CENTRUM_Y + tp.y) + 'px; transform:translate(-50%, -50%); ' +
    'width:' + rozm.w + 'px; height:' + rozm.h + 'px; box-sizing:border-box; border-radius:20px; ' + ramka + (m.typ === "pas" || m.typ === "out" ? ' opacity:0.55;' : '') + '">' + dice + zeton + podpis + '</div>';
}

// Co lezy na tacy gracza (zalezy od widzacego): jawne i odkryte kosci, wlasna ukryta reka, podglad MG albo rewersy
function daneTacy(m, i, ctx) {
  const jawne = (kosci) => kosci.map((v) => ({ v: v }));
  if (m.tryb === "jawne" || m.tryb === "odkryte") {
    return m.kosci ? { kosci: jawne(m.kosci), podpis: m.uklad } : null;
  }
  if (m.tryb !== "ukryte") return null;
  const wlasne = Boolean(ctx.mojUserId && m.userId && m.userId === ctx.mojUserId);
  if (wlasne && Array.isArray(ctx.mojaReka) && ctx.mojaReka.length === m.ukryte) {
    return { kosci: jawne(ctx.mojaReka), podpis: "Tylko dla Ciebie: " + ocenUklad(ctx.mojaReka).nazwa };
  }
  if (ctx.jestMG && ctx.podgladMG && ctx.rekiMG && Array.isArray(ctx.rekiMG[i])) {
    return { kosci: jawne(ctx.rekiMG[i]), podpis: "Podgląd MG: " + ocenUklad(ctx.rekiMG[i]).nazwa };
  }
  return { kosci: Array.from({ length: m.ukryte }, () => ({ tyl: true })), podpis: "kości ukryte" };
}

function miejsceHTML(m, i, p) {
  const k = KOLORY_CHIP[m.typ] || KOLORY_CHIP.wait;
  const aktywny = m.typ === "now";
  const blask = m.zwyciezca ? "0 0 26px #ffd966, 0 0 0 2px #ffd966" : (aktywny ? "0 0 22px " + k.ramka : "none");
  const przygaszony = m.typ === "pas" || m.typ === "out";
  const ramkaTokena = m.zwyciezca ? "#ffd966" : k.ramka;
  const obraz = '<img class="kp-token" src="' + esc(m.token || OBRAZ_ZASTEPCZY) + '" alt="" draggable="false" onerror="this.onerror=null;this.src=\'' + OBRAZ_ZASTEPCZY + '\'" ' +
    'style="display:block; width:54px; height:54px; border-radius:50%; object-fit:cover; background:#0e0905; border:3px solid ' + ramkaTokena + '; box-shadow:0 2px 7px rgba(0,0,0,0.7);' + (aktywny ? ' box-shadow:0 0 16px ' + k.ramka + ';' : '') + '">';
  const znacznik = m.allIn
    ? '<span class="kp-allin" style="position:absolute; left:50%; bottom:-5px; transform:translateX(-50%); padding:0 5px; border-radius:7px; background:#b91c1c; border:1px solid #fecaca; color:#fff; font-size:10px; font-weight:bold; line-height:13px; letter-spacing:0.5px; white-space:nowrap; box-shadow:0 1px 4px rgba(0,0,0,0.7);">ALL-IN</span>'
    : '';
  const token = '<div class="kp-token-ramka" style="position:relative; flex:none; width:54px; height:54px;">' + obraz + znacznik + '</div>';
  const wklad = m.wplacono
    ? '<div class="kp-wklad" title="Wpłacono do puli: ' + esc(m.wplacono) + '" style="font-size:11px; line-height:15px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#ffd966;">wkład: ' + esc(m.wplacono) + '</div>'
    : '';
  return '<div class="kp-miejsce" data-i="' + i + '" style="position:absolute; left:' + (STOL_W / 2 + p.x) + 'px; top:' + (STOL_CENTRUM_Y + p.y) + 'px; transform:translate(-50%, -50%); ' +
    'width:' + MIEJSCE_W + 'px; height:' + MIEJSCE_H + 'px; box-sizing:border-box; padding:5px 8px 5px 6px; display:flex; align-items:center; gap:8px; text-align:left; overflow:hidden; border-radius:10px; ' +
    'border:2px solid ' + ramkaTokena + '; background:linear-gradient(' + k.tlo + ', ' + k.tlo + '), #1b120b; color:' + k.tekst + '; box-shadow:' + blask + ';' +
    (przygaszony ? ' opacity:0.55;' : '') + '">' + token +
    '<div style="flex:1 1 auto; min-width:0;">' +
    '<div class="kp-nazwa" title="' + esc(m.nazwa) + '" style="font-size:14px; font-weight:bold; line-height:16px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#fff3c4;">' + esc(m.nazwa) + '</div>' +
    '<div style="font-size:12px; line-height:16px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + (aktywny ? "▶ " : "") + esc(m.tekst) + '</div>' + wklad + '</div></div>';
}

// Caly stol jako HTML (czysta funkcja: ten sam stan i kontekst daja ten sam wynik)
export function zbudujStolHTML(stan, ctx0) {
  const ctx = ctx0 || {};
  const tlo = "radial-gradient(ellipse at center, #3a2414 0%, #1a0f08 65%, #080402 100%)";
  if (!stan) {
    return '<div class="kp-obszar" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:' + tlo + '; color:#e6dcc8; font-size:18px;">Czekam na rozpoczęcie meczu…</div>';
  }
  const n = stan.miejsca.length;
  const poz = pozycjeMiejsc(n, STOL_PROMIEN_X, STOL_PROMIEN_Y);
  const pozTac = pozycjeMiejsc(n, TACA_PROMIEN_X, TACA_PROMIEN_Y);
  let miejsca = "";
  let tace = "";
  stan.miejsca.forEach((m, i) => {
    miejsca += miejsceHTML(m, i, poz[i]);
    const d = daneTacy(m, i, ctx);
    if (d && m.typ !== "out" && m.typ !== "pas") tace += tacaHTML(m, i, n, d, poz[i], pozTac[i]);
  });
  const rozmiar = Math.min(40, rozmiarImienia(String(stan.imie).length));
  const srodek = '<div class="kp-srodek" style="position:absolute; left:' + (STOL_W / 2) + 'px; top:' + STOL_CENTRUM_Y + 'px; transform:translate(-50%, -50%); width:' + SRODEK_W + 'px; max-height:' + SRODEK_H + 'px; overflow:hidden; text-align:center; color:#f0e6d2; text-shadow:0 2px 6px rgba(0,0,0,0.9);">' +
    '<div style="font-size:13px; letter-spacing:1px; color:#e6dcc8;">' + esc(stan.etykieta) + '</div>' +
    (stan.rola ? '<div style="font-size:22px; font-weight:bold; color:#ffd966; margin-top:4px;">' + esc(stan.rola) + '</div>' : '') +
    '<div style="font-size:' + rozmiar + 'px; font-weight:bold; line-height:1.1; color:#fff3c4; margin:4px 0 6px; overflow-wrap:anywhere;">' + esc(stan.imie) + '</div>' +
    (stan.nastepnyHTML ? '<div style="font-size:15px; color:#e6dcc8;">' + stan.nastepnyHTML + '</div>' : '') +
    (stan.pula ? '<div style="font-size:18px; color:#ffd700; margin-top:6px;">Pula: <strong>' + esc(stan.pula) + '</strong></div>' : '') +
    (stan.komunikat ? '<div style="font-size:15px; margin-top:6px; padding:4px 8px; border-radius:8px; background:rgba(0,0,0,0.35); max-height:56px; overflow:hidden;">' + esc(stan.komunikat) + '</div>' : '') +
    '</div>';
  const wpisy = (Array.isArray(stan.historia) && ctx.panelHistorii !== false) ? stan.historia : [];
  const historia = wpisy.length > 0
    ? '<div class="kp-historia" style="position:absolute; z-index:4; left:' + HISTORIA_L + 'px; top:' + HISTORIA_T + 'px; width:' + HISTORIA_W + 'px; height:' + HISTORIA_H + 'px; box-sizing:border-box; overflow:hidden; padding:4px 8px; border-radius:8px; background:rgba(0,0,0,0.45); border:1px solid rgba(255,243,196,0.18); color:#e6dcc8; pointer-events:none;">' +
      '<div style="font-size:10px; line-height:14px; letter-spacing:1px; color:#c9bfae;">PRZEBIEG GRY</div>' +
      wpisy.map((w, i) => '<div class="kp-wpis" title="' + esc(w) + '" style="font-size:11px; line-height:16px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:' + (i === wpisy.length - 1 ? 1 : 0.6) + ';">' + esc(w) + '</div>').join("") + '</div>'
    : '';
  const przycisk = ctx.jestMG
    ? '<button type="button" data-kp="podglad" style="position:absolute; z-index:6; right:14px; top:12px; cursor:pointer; padding:4px 10px;">' + (ctx.podgladMG ? "Ukryj ręce graczy" : "Pokaż ręce graczy (MG)") + '</button>'
    : '';
  return '<div class="kp-obszar" style="position:relative; width:100%; height:100%; overflow:hidden; display:flex; align-items:center; justify-content:center; background:' + tlo + ';">' +
    '<div class="kp-scena" style="position:relative; flex:none; width:' + STOL_W + 'px; height:' + STOL_H + 'px; transform-origin:center center;">' +
    stolWarstwyHTML((STOL_W / 2) + "px", STOL_CENTRUM_Y + "px", "1130px", "640px") + historia + srodek + miejsca + tace + przycisk + '</div></div>';
}

// Rzut kosci na stol: kosci wylatuja z miejsca gracza, obracaja sie w locie, odbijaja sie od sukna i ukladaja na tacy.
// Jawne kosci w locie pokazuja losowe oczka, a po wyladowaniu wynik. Przy wymianie lecą tylko wymieniane kosci.
export function animujMiejsce(root, animacja, opcje) {
  if (!root || !animacja || typeof root.querySelector !== "function") return 0;
  const taca = root.querySelector('.kp-taca[data-i="' + animacja.miejsce + '"]');
  if (!taca || typeof taca.querySelectorAll !== "function") return 0;
  let kosci = Array.from(taca.querySelectorAll(".kp-kosc, .kp-tyl"));
  if (animacja.rodzaj === "wymiana") {
    // dokladne kosci z indeksow reki; gdy ich brak (starszy MG), ostatnie "ile" kosci
    const idx = Array.isArray(animacja.indeksy) ? animacja.indeksy.filter((n) => n >= 0 && n < kosci.length) : [];
    if (idx.length > 0) kosci = idx.map((n) => kosci[n]);
    else if (animacja.ile > 0 && animacja.ile < kosci.length) kosci = kosci.slice(kosci.length - animacja.ile);
  }
  const czas = (opcje && opcje.czas) || 1100;
  const atr = (el, nazwa) => Number(typeof el.getAttribute === "function" ? el.getAttribute(nazwa) : 0) || 0;
  const tf = (x, y, rot, skala) => "translate(" + Math.round(x) + "px, " + Math.round(y) + "px) rotate(" + Math.round(rot) + "deg) scale(" + skala + ")";
  kosci.forEach((el, i) => {
    if (typeof el.animate !== "function") return;
    const dx = atr(el, "data-dx");
    const dy = atr(el, "data-dy");
    const r = atr(el, "data-rot");
    const znak = i % 2 ? -1 : 1;
    const obrot = znak * 540;
    el.animate([
      { transform: tf(dx, dy, r - obrot, 0.55), offset: 0 },
      { transform: tf(dx * 0.12, dy * 0.12 - 34, r - obrot * 0.35, 1.45), offset: 0.4 },
      { transform: tf(0, 0, r - obrot * 0.08, 1), offset: 0.62 },
      { transform: tf(znak * 5, -12, r + znak * 10, 1.12), offset: 0.78 },
      { transform: tf(0, 0, r - znak * 4, 1), offset: 0.9 },
      { transform: tf(0, 0, r, 1), offset: 1 }
    ], { duration: czas, delay: i * 90, easing: "ease-out", fill: "backwards" });
  });
  const jawne = kosci.filter((el) => el.classList && el.classList.contains("kp-kosc"));
  if (jawne.length > 0) {
    const finalne = jawne.map((el) => el.innerHTML);
    const rozm = jawne.map((el) => atr(el, "data-px") || undefined);
    const ticki = Math.max(2, Math.floor((czas * 0.62) / 90));
    let n = 0;
    const krok = () => {
      n += 1;
      if (n >= ticki) {
        jawne.forEach((el, i) => { el.innerHTML = finalne[i]; });
        return;
      }
      jawne.forEach((el, i) => { el.innerHTML = rysujKoscHTML(1 + Math.floor(Math.random() * 6), true, rozm[i]); });
      setTimeout(krok, 90);
    };
    krok();
  }
  return kosci.length;
}

// ---- Stan i okno po stronie klienta (MG i gracza) ----
const klient = { stan: null, app: null, mojaReka: null, podgladMG: false, ostatniaAnimacja: null, ostatniDzwiek: null, zamkniety: null, zamykanieProgramowe: false };

export const stanKlienta = () => klient;

function kontekst() {
  const u = typeof game !== "undefined" ? game.user : null;
  return {
    mojUserId: u && u.id,
    jestMG: Boolean(u && u.isGM),
    mojaReka: klient.mojaReka,
    panelHistorii: ustawienieKlienta("panelHistorii", true) !== false,
    podgladMG: klient.podgladMG,
    rekiMG: klient.stan && klient.stan.rekiMG
  };
}

function dopasujSkale(content) {
  const scena = content && typeof content.querySelector === "function" ? content.querySelector(".kp-scena") : null;
  if (!scena || !(content.clientWidth > 0) || !(content.clientHeight > 0)) return;
  const s = Math.min(content.clientWidth / STOL_W, content.clientHeight / STOL_H);
  scena.style.transform = "scale(" + s + ")";
}

function poRenderze(content) {
  if (!content || typeof content.querySelector !== "function") return;
  dopasujSkale(content);
  const przycisk = content.querySelector('[data-kp="podglad"]');
  if (przycisk) {
    przycisk.addEventListener("click", () => {
      klient.podgladMG = !klient.podgladMG;
      odswiez();
    });
  }
  const a = klient.stan && klient.stan.animacja;
  if (a && a.id !== klient.ostatniaAnimacja) {
    klient.ostatniaAnimacja = a.id;
    const mnoznik = TEMPO_ANIMACJI[ustawienieKlienta("tempoAnimacji", "normalnie")] || 1;
    animujMiejsce(content, a, { czas: Math.round(1100 * mnoznik) });
    zagrajDzwiek("kosci");
  }
  const d = klient.stan && klient.stan.dzwiek;
  if (d && d.id !== klient.ostatniDzwiek) {
    klient.ostatniDzwiek = d.id;
    zagrajDzwiek(d.typ);
  }
  if (typeof ResizeObserver === "function" && !content._kpObserver) {
    content._kpObserver = new ResizeObserver(() => dopasujSkale(content));
    content._kpObserver.observe(content);
  }
}

function utworzOknoStolu() {
  const Baza = foundry.applications.api.ApplicationV2;
  const szer = Math.round(Math.min(1180, ((typeof window !== "undefined" && window.innerWidth) || 1280) * 0.92));
  const wys = Math.round(Math.min(760, ((typeof window !== "undefined" && window.innerHeight) || 800) * 0.9));
  class OknoStolu extends Baza {
    static DEFAULT_OPTIONS = {
      id: "kosciany-poker-stol",
      classes: ["kosciany-poker-stol"],
      window: { title: "Kościany Poker — stół", resizable: true, minimizable: true },
      position: { width: szer, height: wys }
    };

    async _renderHTML() {
      return zbudujStolHTML(klient.stan, kontekst());
    }

    _replaceHTML(wynik, content) {
      content.style.padding = "0";
      content.style.overflow = "hidden";
      content.innerHTML = wynik;
      poRenderze(content);
    }

    async close(opcje) {
      if (klient.app === this) {
        klient.app = null;
        if (!klient.zamykanieProgramowe && klient.stan) klient.zamkniety = klient.stan.mecz;
      }
      return super.close(opcje);
    }
  }
  return new OknoStolu();
}

function odswiez() {
  if (!klient.stan) return;
  try {
    if (!klient.app) klient.app = utworzOknoStolu();
    const p = klient.app.render({ force: true });
    if (p && typeof p.catch === "function") p.catch((err) => console.warn("Kościany Poker — nie udało się narysować stołu", err));
  } catch (err) {
    console.warn("Kościany Poker — nie udało się otworzyć stołu", err);
  }
}

// Nowy stan stolu od MG (lokalny: stan z tajnymi rekami, tylko na komputerze MG)
export function zastosujStol(surowy, opcje) {
  const stan = oczyscStol(surowy, { zachowajReki: Boolean(opcje && opcje.lokalny) });
  if (!stan) return;
  if (klient.stan && klient.stan.mecz !== stan.mecz) {
    klient.mojaReka = null;
    klient.podgladMG = false;
    klient.zamkniety = null;
    klient.ostatniaAnimacja = null;
    klient.ostatniDzwiek = null;
  }
  if (!klient.stan) {
    // pierwszy stan na tym komputerze (np. po odswiezeniu strony): nie odtwarzamy dzwieku ani animacji z przeszlosci
    klient.ostatniDzwiek = stan.dzwiek ? stan.dzwiek.id : null;
    klient.ostatniaAnimacja = stan.animacja ? stan.animacja.id : null;
  }
  klient.stan = stan;
  if (klient.zamkniety === stan.mecz) return; // gracz zamknal stol recznie: nie otwieramy go ponownie w tym meczu
  odswiez();
}

// Wlasna, ukryta reka gracza (przychodzi tylko do jej wlasciciela)
export function ustawMojaReke(kosci) {
  klient.mojaReka = kosciLista(kosci);
  if (klient.app && klient.stan) odswiez();
}

// Reczne otwarcie stolu (np. po przypadkowym zamknieciu): game.modules.get("kosciany-poker").api.stol()
export function otworzStol() {
  klient.zamkniety = null;
  odswiez();
}

export function zamknijStol() {
  klient.zamykanieProgramowe = true;
  try {
    if (klient.app) klient.app.close();
  } finally {
    klient.zamykanieProgramowe = false;
    klient.app = null;
  }
}

// Czyszczenie stanu klienta (testy i diagnostyka)
export function zresetujStol() {
  Object.assign(klient, { stan: null, app: null, mojaReka: null, podgladMG: false, ostatniaAnimacja: null, ostatniDzwiek: null, zamkniety: null, zamykanieProgramowe: false });
}
