// Funkcje wspolne modulu Koscianny Poker: czyste reguly gry i pomocnicze elementy okien.
// Uzywane zarowno przez silnik (komputer MG), jak i przez okna zdalne (komputery graczy).

export function formatujWaluteWFRP(sumaMP) {
  const zk = Math.floor(sumaMP / 240);
  const resztaPoZK = sumaMP % 240;
  const ss = Math.floor(resztaPoZK / 12);
  const mp = resztaPoZK % 12;
  const czesci = [];
  if (zk > 0) czesci.push(zk + " ZK");
  if (ss > 0) czesci.push(ss + " SS");
  if (mp > 0 || czesci.length === 0) czesci.push(mp + " MP");
  return czesci.join(", ");
}

export function rozlozMonety(sumaMP, dostepne) {
  const wart = [...dostepne].sort((a, b) => b - a);
  const mapa = {};
  let reszta = sumaMP;
  for (const w of wart) {
    mapa[w] = Math.floor(reszta / w);
    reszta = reszta % w;
  }
  return { mapa: mapa, reszta: reszta };
}

export function ocenUklad(kosci) {
  const posortowane = [...kosci].sort((a, b) => b - a);
  const licznik = {};
  for (const k of posortowane) {
    licznik[k] = (licznik[k] || 0) + 1;
  }
  const grupy = Object.entries(licznik)
    .map(([oczko, ilosc]) => ({ oczko: Number(oczko), ilosc: ilosc }))
    .sort((a, b) => (b.ilosc - a.ilosc) || (b.oczko - a.oczko));

  const ilosci = grupy.map((g) => g.ilosc);
  const str = [...kosci].sort((a, b) => a - b).join("");

  let nazwa = "Nic (Wysoka kość)";
  let ranga = 0;

  if (ilosci.at(0) === 5) {
    nazwa = "Poker (piątka " + grupy.at(0).oczko + ")";
    ranga = 8;
  } else if (ilosci.at(0) === 4) {
    nazwa = "Kareta (czwórka " + grupy.at(0).oczko + ")";
    ranga = 7;
  } else if (ilosci.at(0) === 3 && ilosci.at(1) === 2) {
    nazwa = "Ful (" + grupy.at(0).oczko + " na " + grupy.at(1).oczko + ")";
    ranga = 6;
  } else if (str === "23456") {
    nazwa = "Duży Strit (2-3-4-5-6)";
    ranga = 5;
  } else if (str === "12345") {
    nazwa = "Mały Strit (1-2-3-4-5)";
    ranga = 4;
  } else if (ilosci.at(0) === 3) {
    nazwa = "Trójka (" + grupy.at(0).oczko + ")";
    ranga = 3;
  } else if (ilosci.at(0) === 2 && ilosci.at(1) === 2) {
    nazwa = "Dwie Pary (" + grupy.at(0).oczko + " i " + grupy.at(1).oczko + ")";
    ranga = 2;
  } else if (ilosci.at(0) === 2) {
    nazwa = "Para (" + grupy.at(0).oczko + ")";
    ranga = 1;
  }

  const tieBreaker = grupy.reduce((acc, g, idx) => acc + g.oczko * Math.pow(10, 4 - idx), 0);
  return { nazwa: nazwa, ranga: ranga, tieBreaker: tieBreaker };
}
// Pechowy rzut oszusta (96-00): opis zalezy od rzutu, bez dodatkowego losowania (wynik jest powtarzalny i widoczny w logu)
export const PECHY_OSZUSTWA = {
  96: "Pechowy rzut — kość wypada z rękawa i dzwoni o stół!",
  97: "Pechowy rzut — kość wypada z rękawa z brzękiem!",
  98: "Pechowy rzut — rękaw pęka w szwie, a ukryta kość toczy się prosto pod stopy rywala!",
  99: "Pechowy rzut — palce ślizgają się po spoconych kościach i cały stół widzi podmianę!",
  100: "Pechowy rzut — zza pasa wypada cały woreczek z fałszywymi kośćmi!"
};
export function opisPechu(rzut) {
  return PECHY_OSZUSTWA[rzut] || PECHY_OSZUSTWA[97];
}

// Szosty Zmysl: tryb "plus10" (+10 do testu za poziom) albo "ps" (+1 PS za poziom przy udanym tescie, wg zasady ogolnej talentow)
export function szostyZmyslDoTestu(poziom, tryb) {
  const p = Math.max(0, Number(poziom) || 0);
  return tryb === "ps" ? { celPlus: 0, psPlus: p } : { celPlus: p * 10, psPlus: 0 };
}

// Kara dla obserwatorow od talentu Szybkie Ręce: -10 do ich testu za poziom, maks. -30 (nie maja biernego testu Percepcji)
export function karaSzybkichRak(poziom) {
  return Math.min(30, Math.max(0, Number(poziom) || 0) * 10);
}

// Test WFRP 4e: PS = dziesiatki celu - dziesiatki rzutu; 01-05 auto-sukces (min. +1 PS), 96-00 auto-porazka (min. -1 PS)
export function wynikTestu(cel, rzut) {
  let sl = Math.floor(cel / 10) - Math.floor(rzut / 10);
  let sukces = rzut <= cel;
  let auto = null;
  if (rzut <= 5) {
    sukces = true;
    auto = "sukces";
    if (sl < 1) sl = 1;
  } else if (rzut >= 96) {
    sukces = false;
    auto = "porazka";
    if (sl > -1) sl = -1;
  }
  return { sl: sl, sukces: sukces, auto: auto };
}

// Talent Szuler Koscianny: przy UDANYM tescie Hazardu / Zwinnych Palcow podczas gry w kosci mozna zachowac normalne PS
// albo ustalic PS wedlug kosci jednosci (rzut 06 = +6 PS). Automat bierze lepsza z dwoch wartosci.
export function wynikZSzulerem(cel, rzut, poziomSzulera) {
  const t = wynikTestu(cel, rzut);
  if (poziomSzulera > 0 && t.sukces) {
    const jednosci = rzut % 10;
    if (jednosci > t.sl) return { sl: jednosci, sukces: true, auto: t.auto, jednosci: true };
  }
  return t;
}

// Stopien przylapania wg roznicy PS obserwatora nad oszustem: 1-2 / 3-5 / 6+
export function stopienPrzylapania(roznicaPS) {
  if (roznicaPS >= 6) return 3;
  if (roznicaPS >= 3) return 2;
  return 1;
}

// Test przeciwstawny: oszust kontra kazdy obserwator osobno.
// oszust: {rzut, cel, premiaPS (Szybkie Rece, +1 PS za poziom), szuler (poziom talentu Szuler Koscianny)}; obserwatorzy: [{nazwa, rzut, cel}]
// Premia PS (Szybkie Rece) liczy sie tylko przy zdanym tescie oszusta.
export function rozstrzygnijOszustwo(oszust, obserwatorzy) {
  const t = wynikZSzulerem(oszust.cel, oszust.rzut, oszust.szuler || 0);
  const slOszusta = t.sl + (t.sukces ? (oszust.premiaPS || 0) : 0);
  const szczegoly = obserwatorzy.map((o) => {
    const to = wynikTestu(o.cel, o.rzut);
    return { nazwa: o.nazwa, rzut: o.rzut, cel: o.cel, sl: to.sl };
  });
  const najlepszy = szczegoly.reduce((acc, o) => ((!acc || o.sl > acc.sl) ? o : acc), null);
  const baza = { slOszusta: slOszusta, test: t, szczegoly: szczegoly };
  if (t.auto === "porazka") {
    return { ...baza, wynik: "zlapany", stopien: 3, przylapal: najlepszy ? najlepszy.nazwa : null };
  }
  const przewyzszajacy = szczegoly.filter((o) => o.sl > slOszusta);
  if (przewyzszajacy.length > 0) {
    const top = przewyzszajacy.reduce((acc, o) => (o.sl > acc.sl ? o : acc));
    return { ...baza, wynik: "zlapany", stopien: stopienPrzylapania(top.sl - slOszusta), przylapal: top.nazwa };
  }
  if (szczegoly.some((o) => o.sl === slOszusta)) {
    return { ...baza, wynik: "nieudane", stopien: 0, przylapal: null };
  }
  return { ...baza, wynik: "udane", stopien: 0, przylapal: null };
}

// Podpowiedz z "Czytaj z twarzy": Ranald doradza po porownaniu rak, nie zdradzajac kosci rywala (null = porazka testu)
export function podpowiedzCzytania(moj, rywal, roznicaPS) {
  if (roznicaPS < 0) return null;
  const roznica = (moj.ranga - rywal.ranga) || (moj.tieBreaker - rywal.tieBreaker);
  if (roznica > 0) return "Ranald ci sprzyja — idź na całość!";
  if (roznica < 0) return "Ranald ci sprzyja — pasuj, to nie jest twoja runda.";
  return "Ranald milczy — rywal ma równie dobrą rękę.";
}

// Przewaga Hazardu: co najmniej +20 wzgledem WSZYSTKICH pozostalych graczy przy stole
export function maPrzewageHazardu(stan, stany) {
  const inni = stany.filter((r) => r !== stan);
  if (inni.length === 0) return false;
  const h = stan.graczObj.statystyki.hazardWartosc;
  return inni.every((r) => h - r.graczObj.statystyki.hazardWartosc >= 20);
}

// Obciazona kosc: pula 8 scianek (kazda raz + dwie dodatkowe ulubionej); los w [0,1)
export function koscObciazona(ulubiona, los) {
  const pula = [1, 2, 3, 4, 5, 6, ulubiona, ulubiona];
  return pula[Math.floor(los * pula.length)];
}

// Podzial puli z pulami bocznymi. wklady: {klucz: kwota} (wszyscy gracze, takze ci, ktorzy spasowali);
// tiery: [[klucze na 1. miejscu], [klucze na 2. miejscu], ...] - tylko gracze uprawnieni do wygranej (bez spasowanych i wyrzuconych).
// Kazda "warstwa" puli (od jednego poziomu wkladu do nastepnego) trafia do najlepszej grupy sposrod uprawnionych,
// ktorzy do tej warstwy dolozyli. Przy remisie warstwa jest dzielona po rowno, a niepodzielna reszta jest zwracana jako "reszta".
// Warstwa, do ktorej nie dolozyl zaden uprawniony gracz, wraca do tych, ktorzy ja wplacili.
export function podzielPule(wklady, tiery) {
  const wyplaty = {};
  const dodaj = (k, v) => { if (v > 0) wyplaty[k] = (wyplaty[k] || 0) + v; };
  let reszta = 0;
  const klucze = Object.keys(wklady);
  const poziomy = [...new Set(klucze.map((k) => wklady[k]).filter((v) => v > 0))].sort((x, y) => x - y);
  let poprzedni = 0;
  for (const poziom of poziomy) {
    const wWarstwie = klucze.filter((k) => wklady[k] >= poziom);
    const wysokosc = poziom - poprzedni;
    const kwota = wysokosc * wWarstwie.length;
    let zwyciezcy = [];
    for (const tier of tiery) {
      zwyciezcy = tier.filter((k) => wklady[k] >= poziom);
      if (zwyciezcy.length > 0) break;
    }
    if (zwyciezcy.length === 0) {
      for (const k of wWarstwie) dodaj(k, wysokosc);
    } else {
      const udzial = Math.floor(kwota / zwyciezcy.length);
      for (const k of zwyciezcy) dodaj(k, udzial);
      reszta += kwota - udzial * zwyciezcy.length;
    }
    poprzedni = poziom;
  }
  return { wyplaty: wyplaty, reszta: reszta };
}

// Szuler Koscianny (wymiana): z puli rzuconych kosci wybiera potrzebna liczbe kosci dajacych najlepszy uklad razem z zachowanymi kosciami.
// Zwraca {wybrane, odrzucone, uklad}.
export function najlepszeZPuli(zachowane, pula, ile) {
  let najlepszy = null;
  const n = pula.length;
  const wybierz = (start, wybrane) => {
    if (wybrane.length === ile) {
      const kosci = zachowane.concat(wybrane.map((i) => pula.at(i)));
      const u = ocenUklad(kosci);
      if (!najlepszy || u.ranga > najlepszy.uklad.ranga || (u.ranga === najlepszy.uklad.ranga && u.tieBreaker > najlepszy.uklad.tieBreaker)) {
        najlepszy = { indeksy: [...wybrane], uklad: u };
      }
      return;
    }
    for (let i = start; i < n; i++) wybierz(i + 1, wybrane.concat([i]));
  };
  wybierz(0, []);
  const wybrane = najlepszy.indeksy.map((i) => pula.at(i));
  const odrzucone = pula.filter((_, i) => !najlepszy.indeksy.includes(i));
  return { indeksy: najlepszy.indeksy, wybrane: wybrane, odrzucone: odrzucone, uklad: najlepszy.uklad };
}
// Pozycje miejsc przy stole wzgledem srodka (px): pierwszy gracz siedzi na dole, dalej zgodnie z ruchem wskazowek zegara
export function pozycjeMiejsc(n, rx, ry) {
  const wynik = [];
  for (let i = 0; i < n; i++) {
    const kat = Math.PI / 2 + (i * 2 * Math.PI) / n;
    wynik.push({ x: Math.round(rx * Math.cos(kat)), y: Math.round(ry * Math.sin(kat)) });
  }
  return wynik;
}

export const OBRAZ_ZASTEPCZY = "icons/svg/mystery-man.svg";

// Obraz postaci na stole: token (wizerunek z mapy), a gdy jest filmem (webm/mp4) albo go brak - portret z karty
export function obrazTokena(actor) {
  const ok = (s) => typeof s === "string" && s.trim() !== "" && !/\.(webm|mp4|m4v|ogv)(\?.*)?$/i.test(s);
  const token = actor && actor.prototypeToken && actor.prototypeToken.texture ? actor.prototypeToken.texture.src : null;
  if (ok(token)) return token;
  if (actor && ok(actor.img)) return actor.img;
  return OBRAZ_ZASTEPCZY;
}

// Obraz z sieci: tylko zwykly plik graficzny z adresu wzglednego albo http(s), bez cudzyslowow, znacznikow i sciezek wyzej
export function bezpiecznyObraz(s) {
  if (typeof s !== "string" || s.length > 300) return OBRAZ_ZASTEPCZY;
  const tekst = s.trim();
  if (/["'<>\\\x60]|\.\./.test(tekst)) return OBRAZ_ZASTEPCZY;
  if (/^[a-z][a-z0-9+.-]*:/i.test(tekst) && !/^https?:\/\//i.test(tekst)) return OBRAZ_ZASTEPCZY;
  if (!/\.(png|jpe?g|webp|svg|gif|avif|bmp)(\?[\w=&.%-]*)?$/i.test(tekst)) return OBRAZ_ZASTEPCZY;
  return tekst;
}

// Rozmiar czcionki imienia w centrum stolu zalezny od dlugosci (dluzsze imiona sa mniejsze)
export function rozmiarImienia(dlugosc) {
  if (dlugosc <= 10) return 64;
  if (dlugosc <= 16) return 48;
  if (dlugosc <= 24) return 36;
  return 28;
}

export function esc(tekst) {
  return String(tekst)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function rysujKoscHTML(wartosc, mala, px) {
  const wlasny = Number.isFinite(px) && px >= 16 && px <= 120;
  const rozmiar = wlasny ? Math.round(px) + "px" : (mala ? "30px" : "58px");
  const kropkaRozmiar = wlasny ? Math.max(3, Math.round(px * 0.17)) + "px" : (mala ? "5px" : "10px");
  const obramowanie = wlasny ? Math.max(2, Math.round(px * 0.055)) + "px" : (mala ? "2px" : "3px");
  const zaokraglenie = wlasny ? Math.round(px * 0.2) + "px" : (mala ? "6px" : "10px");
  const odstep = wlasny ? Math.max(2, Math.round(px * 0.11)) + "px" : (mala ? "3px" : "6px");
  const ukladOczek = { 1: "4", 2: "0,8", 3: "0,4,8", 4: "0,2,6,8", 5: "0,2,4,6,8", 6: "0,2,3,5,6,8" };
  const aktywnePola = ukladOczek[wartosc].split(",");
  let siatka = "";
  for (let i = 0; i < 9; i++) {
    const maOczko = aktywnePola.includes(String(i));
    siatka += '<div style="display:flex; align-items:center; justify-content:center;">';
    if (maOczko) {
      siatka += '<span style="width:' + kropkaRozmiar + '; height:' + kropkaRozmiar + '; background:#1a1510; border-radius:50%; display:block;"></span>';
    }
    siatka += '</div>';
  }
  return '<div class="poker-die-box" style="width:' + rozmiar + '; height:' + rozmiar + '; background:linear-gradient(145deg, #fdfbf7, #e6dcc8); border:' + obramowanie + ' solid #5c4632; border-radius:' + zaokraglenie + '; box-shadow:0 2px 5px rgba(0,0,0,0.5); display:grid; grid-template-columns:repeat(3, 1fr); grid-template-rows:repeat(3, 1fr); padding:' + odstep + '; box-sizing:border-box; transition:all 0.15s ease;">' + siatka + '</div>';
}

// Podswietlanie kosci zaznaczonych do wymiany
export function renderWyboruKosci(event, dialog) {
  dialog.element.querySelectorAll(".poker-die-label").forEach((label) => {
    const checkbox = label.querySelector("input[type='checkbox']");
    const box = label.querySelector(".poker-die-box");
    const tag = label.querySelector(".poker-die-tag");
    const wartosc = tag.textContent.slice(0, 3);

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        box.style.borderColor = "#ff3b2f";
        box.style.boxShadow = "0 0 14px #ff3b2f";
        box.style.transform = "translateY(-6px)";
        box.style.background = "linear-gradient(145deg, #ffd6d2, #f29b94)";
        tag.style.color = "#ff5e54";
        tag.textContent = wartosc + " WYMIEŃ";
      } else {
        box.style.borderColor = "#5c4632";
        box.style.boxShadow = "0 2px 5px rgba(0,0,0,0.5)";
        box.style.transform = "translateY(0)";
        box.style.background = "linear-gradient(145deg, #fdfbf7, #e6dcc8)";
        tag.style.color = "#ccc";
        tag.textContent = wartosc + " ZOSTAW";
      }
    });
  });
}

export function renderWyboruZPuli(dialog, { pula, zachowane, ile }) {
  const el = dialog.element;
  const etykiety = Array.from(el.querySelectorAll(".poker-pula-label"));
  const podglad = el.querySelector("#poker-podglad");
  // Kolejnosc zaznaczen: gdy limit jest pelny, nowe klikniecie zastepuje najdawniej zaznaczona kosc
  const kolejnosc = [];
  etykiety.forEach((l, i) => { if (l.querySelector("input[type='checkbox']").checked) kolejnosc.push(i); });
  const odswiez = () => {
    const wybrane = [];
    etykiety.forEach((label, idx) => {
      const cb = label.querySelector("input[type='checkbox']");
      const box = label.querySelector(".poker-die-box");
      const tag = label.querySelector(".poker-pula-tag");
      const wartosc = pula.at(idx);
      if (cb.checked) {
        wybrane.push(wartosc);
        box.style.borderColor = "#3bbf5a";
        box.style.boxShadow = "0 0 14px #3bbf5a";
        box.style.transform = "translateY(-6px)";
        tag.style.color = "#7ae582";
        tag.textContent = "(" + wartosc + ") DO RĘKI";
      } else {
        box.style.borderColor = "#5c4632";
        box.style.boxShadow = "0 2px 5px rgba(0,0,0,0.5)";
        box.style.transform = "translateY(0)";
        tag.style.color = "#ccc";
        tag.textContent = "(" + wartosc + ") ODRZUĆ";
      }
    });
    if (podglad) {
      podglad.textContent = wybrane.length === ile
        ? "Układ po wyborze: " + ocenUklad(zachowane.concat(wybrane)).nazwa
        : "Zaznacz dokładnie " + ile + " (zaznaczono " + wybrane.length + ")";
    }
  };
  etykiety.forEach((label) => {
    const cb = label.querySelector("input[type='checkbox']");
    cb.addEventListener("change", () => {
      const idx = etykiety.indexOf(label);
      const poz = kolejnosc.indexOf(idx);
      if (cb.checked) {
        if (poz < 0) kolejnosc.push(idx);
        while (kolejnosc.length > ile) {
          const najstarszy = kolejnosc.shift();
          etykiety.at(najstarszy).querySelector("input[type='checkbox']").checked = false;
        }
      } else if (poz >= 0) {
        kolejnosc.splice(poz, 1);
      }
      odswiez();
    });
  });
  odswiez();
}

export function renderOszukaj(dialog, { kosci }) {
  const stan = { kosci };
  const el = dialog.element;
  const selKosc = el.querySelector("select[name='die_idx']");
  const selOczko = el.querySelector("select[name='new_val']");
  if (!selKosc || !selOczko) return;
  const odswiez = () => {
    const aktualne = stan.kosci.at(Number(selKosc.value));
    const opcje = Array.from(selOczko.options);
    opcje.forEach((o) => { o.disabled = Number(o.value) === aktualne; });
    if (Number(selOczko.value) === aktualne) {
      const inna = opcje.find((o) => !o.disabled);
      if (inna) selOczko.value = inna.value;
    }
  };
  selKosc.addEventListener("change", odswiez);
  odswiez();
}

export function renderPanelAkcji(dialog, naAkcje) {
  dialog.element.querySelectorAll("button[data-poker]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      naAkcje(btn.getAttribute("data-poker"));
      dialog.close();
    });
  });
}

export const ID_MODULU = "kosciany-poker";
export const NAZWA_ZAPYTANIA = ID_MODULU + ".okno";
export const KANAL_SOCKET = "module." + ID_MODULU;

// ---- Automat dla BN-ow (bohaterowie niezalezni przy stole): proste, uczciwe reguly ----
// Indeksy kosci do wymiany: zostaw strita lub lepszy, zostaw pary i trojki, przy "nic" celuj w strita albo zostaw najwyzsza kosc
export function wymianaAutomatu(kosci) {
  const u = ocenUklad(kosci);
  if (u.ranga >= 4) return [];
  const licznik = {};
  for (const k of kosci) licznik[k] = (licznik[k] || 0) + 1;
  if (u.ranga >= 1) return kosci.map((k, i) => (licznik[k] >= 2 ? -1 : i)).filter((i) => i >= 0);
  for (const zakres of [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]]) {
    const braki = zakres.filter((v) => !kosci.includes(v));
    if (braki.length === 1) {
      const uzyte = new Set();
      const idx = [];
      kosci.forEach((k, i) => {
        if (zakres.includes(k) && !uzyte.has(k)) uzyte.add(k);
        else idx.push(i);
      });
      return idx;
    }
  }
  const zostaje = kosci.indexOf(Math.max(...kosci));
  return kosci.map((k, i) => i).filter((i) => i !== zostaje);
}

// Darmowy przerzut z Przewagi Hazardu: pierwsza kosc, ktora automat i tak by wymienil (albo -1)
export function ekstraAutomatu(kosci) {
  const idx = wymianaAutomatu(kosci);
  return idx.length > 0 ? idx.at(0) : -1;
}

// Czy automat podbija: tylko z trojka lub lepszym ukladem i gdy podbicie jest mozliwe
export function akcjaAutomatu(ranga, mozePodbic) {
  return (mozePodbic && ranga >= 3) ? "podbij" : "nic";
}

// Wszystkie 7776 rak 5k6 posortowane do porownan (liczone raz, przy pierwszym uzyciu)
let wszystkieRece = null;
const silaReki = (k) => { const u = ocenUklad(k); return { s: u.ranga * 1000000 + u.tieBreaker, r: u.ranga }; };
function tabelaRak() {
  if (wszystkieRece) return wszystkieRece;
  wszystkieRece = [];
  for (let n = 0; n < 7776; n++) {
    const k = [];
    let x = n;
    for (let i = 0; i < 5; i++) { k.push(1 + (x % 6)); x = Math.floor(x / 6); }
    wszystkieRece.push(silaReki(k));
  }
  return wszystkieRece;
}

// Szansa, ze reka pobije jedna reke z podanej listy (remis liczy sie za pol)
function szansaNa(s, lista) {
  let w = 0;
  for (const h of lista) w += h.s < s ? 1 : (h.s === s ? 0.5 : 0);
  return w / lista.length;
}

// Ocena automatu: szansa wygranej rundy przy dopelnieniu podbicia. Podbijajacy ma najczesciej mocna reke
// (70%: dwie pary lub lepiej, 30%: blef albo luzna gra); kazdy dodatkowy rywal to losowa reka.
export function szansaWygranej(kosci, rywale) {
  const wszystkie = tabelaRak();
  const mocne = wszystkie.filter((h) => h.r >= 2);
  const s = silaReki(kosci).s;
  const przeciwPodbijajacemu = 0.7 * szansaNa(s, mocne) + 0.3 * szansaNa(s, wszystkie);
  const przeciwLosowej = szansaNa(s, wszystkie);
  return przeciwPodbijajacemu * Math.pow(przeciwLosowej, Math.max(0, (rywale || 1) - 1));
}

// Czy automat dopelnia cudze podbicie: zalezy od jego kosci, kwoty, puli i sakiewki.
// ctx: {kwota (podbicie w MP), portfel (MP; Infinity bez sakiewki), pula (MP przed podbiciem), rywale (ilu rywali zostaje)}
// Zasady: bez monet pasuje; nie ryzykuje ponad polowy sakiewki bez fula lub lepszego; poza tym dopelnia, gdy
// szansa wygranej razy pula po dopelnieniu pokrywa koszt z 25% zapasem.
export function doplataAutomatu(kosci, ctx) {
  const kwota = Math.max(0, Number(ctx && ctx.kwota) || 0);
  const portfel = ctx && ctx.portfel != null ? ctx.portfel : Infinity;
  if (portfel < 1) return false;
  const koszt = Math.min(kwota, portfel);
  if (koszt <= 0) return true;
  const ranga = ocenUklad(kosci).ranga;
  if (Number.isFinite(portfel) && koszt > portfel / 2 && ranga < 6) return false;
  const pula = Math.max(0, Number(ctx && ctx.pula) || 0);
  const p = szansaWygranej(kosci, ctx && ctx.rywale);
  return p * (pula + kwota + koszt) >= koszt * 1.25;
}

// Kwota podbicia automatu: stawka wpisowa (12 MP gdy brak), podwojna z fulem lub lepszym; maks. polowa sakiewki
export function kwotaPodbiciaAutomatu(ranga, stawka, portfel) {
  let kwota = (stawka > 0 ? stawka : 12) * (ranga >= 6 ? 2 : 1);
  if (Number.isFinite(portfel)) kwota = Math.min(kwota, Math.floor(portfel / 2));
  return Math.max(0, kwota);
}
