// Odczyt kart postaci WFRP 4e: sakiewka, umiejetnosci, talenty, kosci i Punkty Szczescia.
// Wspolne dla silnika gry i polecenia diagnostycznego (api.diagnostyka), zeby sprawdzenie pokazywalo dokladnie to, co zobaczy gra.
import { esc, formatujWaluteWFRP } from "./wspolne.js";

const WARTOSCI_MONET = [240, 12, 1]; // ZK, SS, MP

export function fortunaAktora(actor) {
  const v = actor?.system?.status?.fortune?.value;
  return typeof v === "number" ? v : null;
}

// Nominal monety w pensach: najpierw po nazwie (Zlota Korona / Srebrny Szyling / Miedziany Pens),
// a gdy nazwa nic nie mowi - po wartosci coinValue. Zwraca null dla nierozpoznanej pozycji.
export function nominalMonety(m) {
  const nazwa = String(m.name || "").toLowerCase();
  if (/złot|zlot|gold|koron|crown/.test(nazwa)) return 240;
  if (/srebr|silver|szyling|shilling/.test(nazwa)) return 12;
  if (/mosi|mied|brass|penn|pens/.test(nazwa)) return 1;
  const val = Number(m.system.coinValue?.value ?? m.system.coinValue ?? 0);
  return WARTOSCI_MONET.includes(val) ? val : null;
}

export function monetyStandardowe(actor) {
  return actor.items.filter((i) => i.type === "money" && nominalMonety(i) !== null);
}

export function monetyNieznane(actor) {
  return actor.items.filter((i) => i.type === "money" && nominalMonety(i) === null);
}

export function wartoscMonety(m) {
  return nominalMonety(m);
}

// Opis do raportu MG: co dokladnie makro odczytalo z karty
export function opisSakiewki(actor) {
  if (!actor) return "brak karty postaci";
  const czesci = monetyStandardowe(actor).map((m) => esc(m.name) + " ×" + iloscMonety(m) + " (po " + nominalMonety(m) + " MP)");
  const nieznane = monetyNieznane(actor).map((m) => esc(m.name) + " (pominięta: nierozpoznany nominał)");
  return czesci.concat(nieznane).join("; ") || "brak monet na karcie";
}

export function iloscMonety(m) {
  return Number(m.system.quantity?.value ?? m.system.quantity ?? 0);
}


// Rodzaj przedmiotu zwiazanego z koscmi: "zestaw" (zwykle), "obciazone" (obciazone / falszywe / znaczone) albo null
export function rodzajKosci(item) {
  if (item.type === "talent" || item.type === "skill" || item.type === "money") return null;
  if (item.system?.quantity === undefined || iloscMonety(item) <= 0) return null;
  const nazwa = String(item.name || "").toLowerCase();
  if (!/kości|kosci|kostk|dice/.test(nazwa)) return null;
  return /obciążon|obciazon|fałszyw|falszyw|znaczon|loaded|weighted|false|cheat|marked/.test(nazwa) ? "obciazone" : "zestaw";
}

export function analizujPostacWFRP(actor) {
  const dane = {
    maAktora: Boolean(actor),
    szczescieMax: 0,
    szulerPoziom: 0,
    szybkieRekePoziom: 0,
    szostyZmyslPoziom: 0,
    hazardWartosc: 0,
    intuicjaWartosc: 0,
    zwinnePalceWartosc: 0,
    maZwinnePalce: false, // czy postac faktycznie posiada umiejetnosc (zaawansowana) Zwinne Palce
    percepcjaWartosc: 0,
    opanowanieWartosc: 0,
    maZestawKosci: false,      // przedmiot: zestaw do gry w kosci
    maObciazoneKosci: false,   // przedmiot: obciazone / falszywe kosci
    karaZestaw: false          // ustawiane przy starcie meczu (tryb kary)
  };
  if (!actor) return dane;

  const zrecznosc = Number(actor.system.characteristics?.ag?.value ?? 30);
  const inteligencja = Number(actor.system.characteristics?.int?.value ?? 30);
  const inicjatywa = Number(actor.system.characteristics?.i?.value ?? 30);
  const silaWoli = Number(actor.system.characteristics?.wp?.value ?? 30);

  dane.hazardWartosc = inteligencja;
  dane.intuicjaWartosc = inicjatywa;
  dane.zwinnePalceWartosc = zrecznosc;
  dane.percepcjaWartosc = inicjatywa;
  dane.opanowanieWartosc = silaWoli;

  for (const item of actor.items) {
    const nazwa = item.name.toLowerCase();
    // Przedmioty fizyczne (maja ilosc) zwiazane z koscmi
    const rk = rodzajKosci(item);
    if (rk === "obciazone") dane.maObciazoneKosci = true;
    else if (rk === "zestaw") dane.maZestawKosci = true;
    if (item.type === "talent") {
      const poz = Number(item.system.advances?.value ?? item.system.advances ?? 1) || 1;
      if (nazwa.includes("szczęście") || nazwa.includes("luck")) dane.szczescieMax += poz;
      // Szuler Kościany (Dicer) dotyczy gier w kości; Szuler Karciany (Card Sharp) jest pomijany
      if (!/karcian|card ?sharp/.test(nazwa) && /szuler|dicer|diceman/.test(nazwa)) dane.szulerPoziom += poz;
      // Szybkie Rece (Fast Hands): talent do Zwinnych Palcow, +1 PS za poziom przy udanym tescie.
      // Talent Zreczny (Nimble Fingered) to tylko +5 do Zrecznosci na starcie (jest juz w wartosci z karty), wiec nie daje premii.
      if (/fast hands|szybkie rę|szybkie rece|szybkie dło|szybkie dlo/.test(nazwa)) dane.szybkieRekePoziom += poz;
      if (nazwa.includes("szósty zmysł") || nazwa.includes("sixth sense")) dane.szostyZmyslPoziom += poz;
    } else if (item.type === "skill") {
      const total = Number(item.system.total?.value ?? item.system.total ?? 0);
      const adv = Number(item.system.advances?.value ?? 0);
      if (nazwa.includes("hazard") || nazwa.includes("gamble")) dane.hazardWartosc = total || (inteligencja + adv);
      if (nazwa.includes("intuicja") || nazwa.includes("intuition")) dane.intuicjaWartosc = total || (inicjatywa + adv);
      if (nazwa.includes("zwinne palce") || nazwa.includes("sleight of hand")) {
        dane.maZwinnePalce = true;
        dane.zwinnePalceWartosc = total || (zrecznosc + adv);
      }
      if (nazwa.includes("percepcja") || nazwa.includes("perception")) dane.percepcjaWartosc = total || (inicjatywa + adv);
      if (nazwa.includes("opanowanie") || nazwa.includes("cool")) dane.opanowanieWartosc = total || (silaWoli + adv);
    }
  }
  return dane;
}



// Sakiewka postaci w pensach (tylko monety o rozpoznanym nominale)
export function stanSakiewkiMP(actor) {
  let suma = 0;
  for (const m of monetyStandardowe(actor)) suma += iloscMonety(m) * wartoscMonety(m);
  return suma;
}

// ---- DIAGNOSTYKA KART ----
// Wynik: {nazwa, wiersze: [{poziom: "ok" | "uwaga" | "brak", etykieta, tekst}]}. Poziomy: ok = rozpoznano,
// uwaga = gra zadziala, ale inaczej niz zakladasz, brak = nic nie rozpoznano (gra uzyje wartosci zastepczej).
export function diagnozujPostac(actor) {
  const wiersze = [];
  const dodaj = (poziom, etykieta, tekst) => wiersze.push({ poziom: poziom, etykieta: etykieta, tekst: tekst });
  const nazwa = actor && actor.name ? String(actor.name) : "(brak karty)";
  if (!actor) {
    dodaj("brak", "Karta", "Brak karty postaci: gra używa wartości zastępczych, a monety nie są pobierane.");
    return { nazwa: nazwa, wiersze: wiersze };
  }
  const items = Array.from(actor.items || []);
  const st = analizujPostacWFRP(actor);

  // Sakiewka
  const standardowe = monetyStandardowe(actor);
  const nieznane = monetyNieznane(actor);
  if (standardowe.length === 0) {
    dodaj("brak", "Sakiewka", "Brak monet o rozpoznanym nominale. Gra nie pobierze wpisowego ani podbić z tej karty (dodaj monety ZK/SS/MP do ekwipunku).");
  } else {
    const czesci = standardowe.map((m) => m.name + " ×" + iloscMonety(m) + " (po " + nominalMonety(m) + " MP)");
    dodaj("ok", "Sakiewka", formatujWaluteWFRP(stanSakiewkiMP(actor)) + " [" + czesci.join("; ") + "]");
    const nominaly = new Set(standardowe.map((m) => nominalMonety(m)));
    const brakujace = [240, 12, 1].filter((n) => !nominaly.has(n)).map((n) => (n === 240 ? "ZK" : n === 12 ? "SS" : "MP"));
    if (brakujace.length > 0 && !nominaly.has(1)) {
      dodaj("uwaga", "Reszta", "Brak pozycji monet: " + brakujace.join(", ") + ". Przy wypłacie reszty mniejszej niż najmniejsza moneta kwota przepadnie (dodaj pozycję Mosiężny Pens, może być z ilością 0).");
    }
  }
  nieznane.forEach((m) => dodaj("uwaga", "Moneta", m.name + ": nierozpoznany nominał, pominięta w sakiewce."));

  // Umiejetnosci i cechy
  const maUmiejetnosc = (re) => items.some((i) => i.type === "skill" && re.test(String(i.name || "").toLowerCase()));
  const umiej = [
    ["Hazard", /hazard|gamble/, st.hazardWartosc, "Inteligencja"],
    ["Intuicja", /intuicja|intuition/, st.intuicjaWartosc, "Inicjatywa"],
    ["Percepcja", /percepcja|perception/, st.percepcjaWartosc, "Inicjatywa"],
    ["Opanowanie", /opanowanie|cool/, st.opanowanieWartosc, "Siła Woli"],
    ["Zwinne Palce", /zwinne palce|sleight of hand/, st.zwinnePalceWartosc, "Zręczność"]
  ];
  for (const [etykieta, re, wartosc, cecha] of umiej) {
    if (maUmiejetnosc(re)) dodaj("ok", etykieta, wartosc + "% (z umiejętności na karcie)");
    else dodaj(etykieta === "Zwinne Palce" ? "uwaga" : "brak", etykieta, "brak umiejętności na karcie: test na cesze (" + cecha + " " + wartosc + "%)" + (etykieta === "Zwinne Palce" ? "; oszustwo wymaga umiejętności Zwinne Palce albo talentu Szuler Kościany." : "."));
  }

  // Talenty
  const talenty = items.filter((i) => i.type === "talent");
  const poziomTalentu = (i) => Number(i.system && i.system.advances && (i.system.advances.value ?? i.system.advances)) || 1;
  const wymien = (pasuje) => talenty.filter((i) => pasuje(String(i.name || "").toLowerCase()));
  const karciane = wymien((n) => /karcian|card ?sharp/.test(n));
  const talentyLista = [
    ["Szuler Kościany", st.szulerPoziom, "dodatkowe kości w wymianie, wybór PS przy udanym teście, limit podmian"],
    ["Szybkie Ręce", st.szybkieRekePoziom, "+1 PS za poziom przy udanym teście Zwinnych Palców"],
    ["Szósty Zmysł", st.szostyZmyslPoziom, "więcej użyć Czytaj z twarzy; premia do testu (+10 albo +1 PS za poziom) zależy od opcji w oknie startowym"],
    ["Szczęście", st.szczescieMax, "przerzut kości (Szczęście Ranalda)"]
  ];
  for (const [etykieta, poziom, opis] of talentyLista) {
    if (poziom > 0) dodaj("ok", etykieta, "poziom " + poziom + " (" + opis + ")");
    else dodaj("brak", etykieta, "nie rozpoznano na karcie");
  }
  karciane.forEach((i) => dodaj("uwaga", i.name, "talent do gier w karty, pominięty (dotyczy kości tylko Szuler Kościany)."));

  // Punkty Szczescia
  const fortuna = fortunaAktora(actor);
  if (fortuna !== null) dodaj("ok", "Punkty Szczęścia", fortuna + " (pole Fortuna z karty; Szczęście Ranalda zużywa po 1)");
  else dodaj(st.szczescieMax > 0 ? "uwaga" : "brak", "Punkty Szczęścia", "brak pola Fortuna na karcie" + (st.szczescieMax > 0 ? ": użyte zostaną ładunki z talentu Szczęście." : "."));

  // Kosci
  const zestawy = items.filter((i) => rodzajKosci(i) === "zestaw").map((i) => i.name);
  const obciazone = items.filter((i) => rodzajKosci(i) === "obciazone").map((i) => i.name);
  dodaj(zestawy.length > 0 ? "ok" : "brak", "Zestaw kości", zestawy.length > 0 ? zestawy.join(", ") : "brak (w trybie z karą: −10 do Hazardu; wpisz przedmiot z „kości” w nazwie i ilością 1+).");
  dodaj(obciazone.length > 0 ? "ok" : "brak", "Obciążone kości", obciazone.length > 0 ? obciazone.join(", ") : "brak");
  return { nazwa: nazwa, wiersze: wiersze };
}

// Raport HTML (okno MG); wszystkie teksty z kart sa escapowane
export function raportDiagnostykiHTML(diagnozy) {
  const kolory = { ok: "#7ae582", uwaga: "#ffd166", brak: "#f08080" };
  const znaczki = { ok: "OK", uwaga: "UWAGA", brak: "BRAK" };
  if (!diagnozy || diagnozy.length === 0) {
    return '<p style="padding:8px;">Nie znaleziono postaci do sprawdzenia. Zaznacz tokeny na mapie albo przypisz postacie graczom (Konfiguracja użytkowników).</p>';
  }
  return diagnozy.map((d) => {
    const licz = { ok: 0, uwaga: 0, brak: 0 };
    d.wiersze.forEach((w) => { licz[w.poziom] += 1; });
    const wiersze = d.wiersze.map((w) =>
      '<tr><td style="padding:2px 6px; white-space:nowrap; color:' + kolory[w.poziom] + '; font-weight:bold;">' + znaczki[w.poziom] + '</td>' +
      '<td style="padding:2px 6px; white-space:nowrap;"><strong>' + esc(w.etykieta) + '</strong></td>' +
      '<td style="padding:2px 6px;">' + esc(w.tekst) + '</td></tr>').join("");
    return '<div style="margin-bottom:12px;"><div style="font-size:15px; font-weight:bold; color:#e5c158; border-bottom:1px solid #5c4632; margin-bottom:4px;">' + esc(d.nazwa) +
      ' <span style="font-size:11px; font-weight:normal; color:#c9bfae;">(' + licz.ok + " rozpoznano, " + licz.uwaga + " uwag, " + licz.brak + " braków)</span></div>" +
      '<table style="width:100%; font-size:12px; border-collapse:collapse;">' + wiersze + "</table></div>";
  }).join("");
}

// Postacie do sprawdzenia: zaznaczone tokeny, a gdy nic nie zaznaczono - postacie przypisane graczom
export function postacieDoDiagnostyki() {
  const wynik = [];
  const dodaj = (a) => { if (a && !wynik.some((x) => x.id === a.id)) wynik.push(a); };
  const zaznaczone = typeof canvas !== "undefined" && canvas && canvas.tokens && Array.isArray(canvas.tokens.controlled) ? canvas.tokens.controlled : [];
  zaznaczone.forEach((tok) => dodaj(tok.actor));
  if (wynik.length === 0) {
    for (const u of game.users) if (!u.isGM && u.character) dodaj(u.character);
  }
  return wynik;
}

// Polecenie: game.modules.get("kosciany-poker").api.diagnostyka()
export async function pokazDiagnostyke() {
  const diagnozy = postacieDoDiagnostyki().map((a) => diagnozujPostac(a));
  diagnozy.forEach((d) => {
    console.log("Kościany Poker — diagnostyka: " + d.nazwa, d.wiersze.map((w) => w.poziom.toUpperCase() + " " + w.etykieta + ": " + w.tekst).join("\n"));
  });
  await foundry.applications.api.DialogV2.wait({
    window: { title: "Kościany Poker — sprawdzenie kart" },
    position: { width: 760 },
    content: '<div style="max-height:70vh; overflow:auto; padding:4px;">' + raportDiagnostykiHTML(diagnozy) + "</div>",
    buttons: [{ action: "ok", label: "Zamknij", icon: "fa-solid fa-check", default: true }],
    rejectClose: false
  });
  return diagnozy;
}
