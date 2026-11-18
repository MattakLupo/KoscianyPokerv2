// Elementy ekranowe: stol do gry, banery tur i animacja kubka. Pokazywane na ekranie kazdego gracza.
import { esc, pozycjeMiejsc, rozmiarImienia } from "./wspolne.js";

const czekaj = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- OGLOSZENIA TURY: wspolny wyglad na ekranie prowadzacego i na czacie publicznym ----
export const KOLORY_CHIP = {
  done: { tlo: "rgba(122,229,130,0.18)", ramka: "#7ae582", tekst: "#bbf7c4" },
  now: { tlo: "rgba(229,193,88,0.30)", ramka: "#e5c158", tekst: "#fff3c4" },
  wait: { tlo: "rgba(255,255,255,0.06)", ramka: "#6b5a44", tekst: "#c9bfae" },
  pas: { tlo: "rgba(252,165,165,0.18)", ramka: "#f87171", tekst: "#fecaca" },
  out: { tlo: "rgba(239,68,68,0.28)", ramka: "#ef4444", tekst: "#fecaca" }
};

// wpisy: [{nazwa, typ, tekst}] - nazwa jest escapowana tutaj, tekst to staly napis z kodu
export function chipyHTML(wpisy, duze) {
  let html = "";
  for (const w of wpisy) {
    const k = KOLORY_CHIP[w.typ] || KOLORY_CHIP.wait;
    html += '<span style="display:inline-block; margin:3px; padding:' + (duze ? "6px 12px" : "3px 8px") + '; border:1px solid ' + k.ramka +
      '; background:linear-gradient(' + k.tlo + ', ' + k.tlo + '), rgba(20, 12, 6, 0.85); color:' + k.tekst + '; border-radius:' + (duze ? "16px" : "12px") + '; font-size:' + (duze ? "16px" : "11px") +
      '; font-weight:' + (w.typ === "now" ? "bold" : "normal") + ';">' + (w.typ === "now" ? "▶ " : "") + esc(w.nazwa) + ' — ' + w.tekst + '</span>';
  }
  return html;
}

export function wpisyFaza1(lista, nr) {
  return lista.map((x, i) => ({
    nazwa: x.nazwa,
    typ: i < nr ? "done" : (i === nr ? "now" : "wait"),
    tekst: i < nr ? "rzucił" : (i === nr ? "rzuca" : "czeka")
  }));
}

export function wpisyFaza2(stany, nr) {
  return stany.map((st, i) => ({
    nazwa: st.graczObj.nazwa,
    typ: i < nr ? "done" : (i === nr ? "now" : "wait"),
    tekst: i < nr ? "wymienił" : (i === nr ? "wymienia" : "czeka")
  }));
}

export function wpisyFaza3(stany, aktualny) {
  return stany.map((st) => {
    const nazwa = st.graczObj.nazwa;
    if (st.zdyskwalifikowany || st.graczObj.wyrzucony) return { nazwa: nazwa, typ: "out", tekst: "WYRZUCONY" };
    if (st.spasowal) return { nazwa: nazwa, typ: "pas", tekst: "PAS" };
    if (st === aktualny) return { nazwa: nazwa, typ: "now", tekst: "decyduje" };
    if (st.skonczyl) return { nazwa: nazwa, typ: "done", tekst: "skończył" };
    return { nazwa: nazwa, typ: "wait", tekst: "czeka" };
  });
}

export function nastepnyHTML(imie, brak) {
  return imie ? 'Następny: <strong>' + esc(imie) + '</strong>' : esc(brak);
}

// Warstwy stolu: drewniana obwodka i zielone sukno. Wymiary jako napisy CSS (px, vw, vh, min()).
export function stolWarstwyHTML(lewo, gora, szer, wys) {
  const pozycja = 'position:absolute; left:' + lewo + '; top:' + gora + '; transform:translate(-50%, -50%); border-radius:50%; pointer-events:none;';
  return '<div style="' + pozycja + ' width:calc(' + szer + ' + 44px); height:calc(' + wys + ' + 44px); ' +
    'background:linear-gradient(135deg, #7a4e26, #4b2d14 45%, #6b4220 70%, #3a210e); box-shadow:0 24px 60px rgba(0,0,0,0.9), inset 0 0 0 3px #2a1809;"></div>' +
    '<div style="' + pozycja + ' width:' + szer + '; height:' + wys + '; ' +
    'background:radial-gradient(ellipse at center, #3a8f5b 0%, #256b41 55%, #174a2c 100%); box-shadow:inset 0 0 70px rgba(0,0,0,0.65), inset 0 0 0 3px rgba(229, 193, 88, 0.35);"></div>';
}

export const SCENA_W = 1000;
export const SCENA_H = 580;
export const SCENA_SRODEK_Y = 290;

// Duzy ekran: stol z miejscami graczy dookola (z ich statusami) i napisem tury na suknie
// o: {etykieta, rola, imie, nastepnyHTML, wpisy}; czasMs: czas wyswietlania (0 = do klikniecia)
export function stolSceneHTML(o, czasMs) {
  const wpisy = o.wpisy || [];
  const poz = pozycjeMiejsc(wpisy.length, 395, 232);
  let miejsca = "";
  wpisy.forEach((w, i) => {
    const k = KOLORY_CHIP[w.typ] || KOLORY_CHIP.wait;
    const aktywny = w.typ === "now";
    miejsca += '<div style="position:absolute; left:' + (SCENA_W / 2 + poz[i].x) + 'px; top:' + (SCENA_SRODEK_Y + poz[i].y) + 'px; transform:translate(-50%, -50%); width:150px; height:46px; box-sizing:border-box; ' +
      'padding:3px 8px; text-align:center; overflow:hidden; border-radius:10px; border:2px solid ' + k.ramka + '; background:linear-gradient(' + k.tlo + ', ' + k.tlo + '), #1b120b; color:' + k.tekst + ';' +
      (aktywny ? ' box-shadow:0 0 22px ' + k.ramka + ';' : '') + '">' +
      '<div style="font-size:15px; font-weight:bold; line-height:20px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#fff3c4;">' + esc(w.nazwa) + '</div>' +
      '<div style="font-size:12px; line-height:16px; white-space:nowrap;">' + (aktywny ? "▶ " : "") + w.tekst + '</div></div>';
  });
  const srodek = '<div style="position:absolute; left:' + (SCENA_W / 2) + 'px; top:' + SCENA_SRODEK_Y + 'px; transform:translate(-50%, -50%); width:500px; text-align:center; color:#f0e6d2; text-shadow:0 2px 6px rgba(0,0,0,0.9);">' +
    '<div style="font-size:16px; letter-spacing:2px; color:#e6dcc8;">' + o.etykieta + '</div>' +
    (o.rola ? '<div style="font-size:26px; font-weight:bold; color:#ffd966; margin-top:8px;">' + o.rola + '</div>' : '') +
    '<div style="font-size:' + rozmiarImienia(String(o.imie).length) + 'px; font-weight:bold; line-height:1.1; color:#fff3c4; margin:6px 0 10px; overflow-wrap:anywhere;">' + esc(o.imie) + '</div>' +
    (o.nastepnyHTML ? '<div style="font-size:19px; color:#e6dcc8;">' + o.nastepnyHTML + '</div>' : '') + '</div>';
  const podpowiedz = '<div style="position:absolute; left:0; width:' + SCENA_W + 'px; top:' + (SCENA_H - 28) + 'px; text-align:center; font-size:13px; color:#c9bfae;">Kliknij, aby przejść dalej' +
    (czasMs > 0 ? ' · baner zniknie sam za ' + Math.round(czasMs / 1000) + ' s' : '') + '</div>' +
    (czasMs > 0 ? '<div style="position:absolute; left:' + (SCENA_W / 2 - 150) + 'px; width:300px; top:' + (SCENA_H - 8) + 'px; height:4px; border-radius:2px; background:rgba(255,255,255,0.15);">' +
      '<div id="poker-pasek" style="width:100%; height:4px; border-radius:2px; background:#e5c158; transition:width ' + (czasMs / 1000) + 's linear;"></div></div>' : '');
  return '<div style="position:relative; width:' + SCENA_W + 'px; height:' + SCENA_H + 'px; flex:none;">' +
    stolWarstwyHTML(SCENA_W / 2 + 'px', SCENA_SRODEK_Y + 'px', '680px', '380px') + srodek + miejsca + podpowiedz + '</div>';
}

// Wersja kompaktowa na czat: sukno w drewnianej ramce (widza ja gracze na swoich ekranach)
export function banerHTML(o) {
  return '<div style="text-align:center; padding:10px 8px; border:4px solid #6b4220; border-radius:10px; ' +
    'background:radial-gradient(ellipse at center, #2f7d4f 0%, #1d5a36 65%, #143f26 100%); color:#f0e6d2; box-shadow:inset 0 0 24px rgba(0,0,0,0.55);">' +
    '<div style="font-size:11px; letter-spacing:2px; color:#e6dcc8;">' + o.etykieta + '</div>' +
    (o.rola ? '<div style="font-size:14px; font-weight:bold; color:#ffd966; margin-top:4px;">' + o.rola + '</div>' : '') +
    '<div style="font-size:28px; font-weight:bold; line-height:1.1; color:#fff3c4; text-shadow:0 2px 8px #000; margin:2px 0 6px;">' + esc(o.imie) + '</div>' +
    (o.nastepnyHTML ? '<div style="font-size:12px; color:#e6dcc8; margin-bottom:6px;">' + o.nastepnyHTML + '</div>' : '') +
    '<div>' + chipyHTML(o.wpisy || [], false) + '</div></div>';
}

// Pokazuje scene stolu na calym ekranie prowadzacego; znika po czasie albo po kliknieciu (ms = 0: tylko po kliknieciu)
export async function pokazBanerEkran(o, ms) {
  const overlay = document.createElement("div");
  overlay.id = "kp-baner";
  overlay.style.cssText = "position:fixed; inset:0; z-index:99998; display:flex; align-items:center; justify-content:center; overflow:hidden; cursor:pointer; font-family:inherit; " +
    "background:radial-gradient(ellipse at center, #3a2414 0%, #1a0f08 65%, #080402 100%);";
  const skala = (typeof window !== "undefined" && window.innerWidth) ? Math.min(1, window.innerWidth / 1040, window.innerHeight / 620) : 1;
  overlay.innerHTML = '<div id="poker-scena" style="flex:none; transform:scale(' + skala + ');">' + stolSceneHTML(o, ms) + '</div>';
  document.body.appendChild(overlay);
  const pasek = overlay.querySelector("#poker-pasek");
  if (pasek && ms > 0) {
    await czekaj(30);
    pasek.style.width = "0%";
  }
  await new Promise((resolve) => {
    let koniec = false;
    const zakoncz = () => {
      if (koniec) return;
      koniec = true;
      resolve();
    };
    overlay.addEventListener("click", zakoncz);
    if (ms > 0) setTimeout(zakoncz, ms);
  });
  overlay.remove();
}


// Animacja 2D: skorzany kubek z symbolem Tzeentcha (uproszczona sygnatura), potrzasanie, przechylenie, wysypanie kosci
export async function animujKubek(imieGracza, opisRzutu) {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed; inset:0; background:radial-gradient(ellipse at center, #3a2414 0%, #1a0f08 65%, #080402 100%); z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; pointer-events:none; font-family:inherit;";

  const tytul = document.createElement("div");
  tytul.style.cssText = "position:relative; z-index:1; color:#e5c158; font-size:22px; font-weight:bold; text-shadow:0 2px 6px #000; margin-bottom:24px; letter-spacing:1px;";
  tytul.textContent = imieGracza + " — " + opisRzutu;

  const scena = document.createElement("div");
  scena.style.cssText = "position:relative; width:260px; height:160px; display:flex; align-items:center; justify-content:center;";

  const kubek = document.createElement("div");
  kubek.style.cssText = "width:74px; height:96px; background:linear-gradient(90deg, #3b2313, #6e4226 40%, #2a180c); border:3px solid #1f1108; border-radius:8px 8px 18px 18px; box-shadow:0 10px 20px rgba(0,0,0,0.8); position:relative; z-index:2; transform-origin:center center; transition:transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); display:flex; flex-direction:column; align-items:center; justify-content:flex-start; overflow:hidden;";

  const obrecz = document.createElement("div");
  obrecz.style.cssText = "width:100%; height:14px; background:linear-gradient(90deg, #8c6d46, #d4af37, #6e5230); border-top:1px solid #f5e19c; border-bottom:1px solid #3a2a16;";
  kubek.appendChild(obrecz);

  const znak = document.createElement("div");
  znak.style.cssText = "margin-top:16px; filter:drop-shadow(0 1px 2px #000);";
  znak.innerHTML = '<svg viewBox="0 0 40 40" width="40" height="40" xmlns="http://www.w3.org/2000/svg">' +
    '<g fill="none" stroke="#e5c158" stroke-width="3" stroke-linecap="round">' +
    '<path d="M27 7 C14 5 10 18 20 20 C30 22 26 35 13 33"/>' +
    '</g>' +
    '<circle cx="27" cy="7" r="3" fill="#e5c158"/>' +
    '<circle cx="13" cy="33" r="3" fill="#e5c158"/>' +
    '</svg>';
  kubek.appendChild(znak);

  const kosciKontener = document.createElement("div");
  kosciKontener.style.cssText = "position:absolute; left:110px; top:65px; display:flex; gap:8px; z-index:1;";

  const maleKosci = [];
  for (let i = 0; i < 5; i++) {
    const k = document.createElement("div");
    k.style.cssText = "width:26px; height:26px; background:linear-gradient(145deg, #fdfbf7, #e6dcc8); border:2px solid #5c4632; border-radius:5px; box-shadow:0 4px 8px rgba(0,0,0,0.6); opacity:0; transform:translate(0,0) rotate(0deg) scale(0.5); transition:all 0.55s cubic-bezier(0.22, 1, 0.36, 1); display:flex; align-items:center; justify-content:center; font-weight:bold; color:#1a1510; font-size:13px;";
    k.textContent = "•";
    kosciKontener.appendChild(k);
    maleKosci.push(k);
  }

  scena.appendChild(kubek);
  scena.appendChild(kosciKontener);
  const stolTlo = document.createElement("div");
  stolTlo.style.cssText = "position:absolute; inset:0; pointer-events:none;";
  stolTlo.innerHTML = stolWarstwyHTML("50%", "50%", "min(900px, 88vw)", "min(480px, 64vh)");
  overlay.appendChild(stolTlo);
  overlay.appendChild(tytul);
  overlay.appendChild(scena);
  document.body.appendChild(overlay);

  await czekaj(80);
  kubek.style.transform = "translate(-18px, -12px) rotate(-18deg)";
  await czekaj(160);
  kubek.style.transform = "translate(18px, 8px) rotate(16deg)";
  await czekaj(160);
  kubek.style.transform = "translate(-12px, -10px) rotate(-14deg)";
  await czekaj(160);

  kubek.style.transform = "translate(-45px, -10px) rotate(112deg)";
  await czekaj(140);

  const pozycje = [
    { x: 35, y: 25, rot: 145 },
    { x: 68, y: -12, rot: 260 },
    { x: 85, y: 34, rot: 320 },
    { x: 112, y: 8, rot: 195 },
    { x: 52, y: 52, rot: 410 }
  ];

  maleKosci.forEach((k, idx) => {
    const p = pozycje.at(idx);
    k.style.opacity = "1";
    k.style.transform = "translate(" + p.x + "px, " + p.y + "px) rotate(" + p.rot + "deg) scale(1)";
  });

  await czekaj(850);
  overlay.remove();
}

// Usuwa baner z ekranu (np. gdy prowadzacy go zamknal)
export function zamknijBaner() {
  const el = document.getElementById("kp-baner");
  if (el) el.remove();
}

// Dane banera przychodza przez siec: zostawiamy tylko dozwolone pola i tagi <strong>
const bezTagow = (t) => String(t == null ? "" : t).replace(/<[^>]*>/g, "");
const tylkoStrong = (t) => String(t == null ? "" : t).replace(/<(?!\/?strong>)[^>]*>/g, "");
export function oczyscBaner(o) {
  const dozwolone = ["done", "now", "wait", "pas", "out"];
  const wpisy = Array.isArray(o && o.wpisy) ? o.wpisy : [];
  return {
    etykieta: bezTagow(o && o.etykieta),
    rola: bezTagow(o && o.rola),
    imie: String(o && o.imie != null ? o.imie : ""),
    nastepnyHTML: tylkoStrong(o && o.nastepnyHTML),
    wpisy: wpisy.slice(0, 12).map((w) => ({
      nazwa: String(w && w.nazwa != null ? w.nazwa : ""),
      typ: dozwolone.includes(w && w.typ) ? w.typ : "wait",
      tekst: bezTagow(w && w.tekst)
    }))
  };
}
