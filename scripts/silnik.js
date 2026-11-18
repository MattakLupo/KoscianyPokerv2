// Silnik gry Koscianny Poker (modul Foundry VTT v14, WFRP 4e). Dziala na komputerze Mistrza Gry.
import { formatujWaluteWFRP, rozlozMonety, ocenUklad, wynikTestu, wynikZSzulerem, stopienPrzylapania, rozstrzygnijOszustwo, podpowiedzCzytania, maPrzewageHazardu, koscObciazona, podzielPule, najlepszeZPuli, pozycjeMiejsc, rozmiarImienia, esc, rysujKoscHTML, obrazTokena, renderWyboruKosci, renderWyboruZPuli, renderOszukaj, renderPanelAkcji, ID_MODULU, NAZWA_ZAPYTANIA, KANAL_SOCKET, wymianaAutomatu, ekstraAutomatu, akcjaAutomatu, doplataAutomatu, kwotaPodbiciaAutomatu, opisPechu, szostyZmyslDoTestu, karaSzybkichRak } from "./wspolne.js";
import { KOLORY_CHIP, chipyHTML, wpisyFaza1, wpisyFaza2, wpisyFaza3, nastepnyHTML, stolWarstwyHTML, SCENA_W, SCENA_H, SCENA_SRODEK_Y, stolSceneHTML, banerHTML, pokazBanerEkran, animujKubek as animujKubekLokalnie, zamknijBaner, oczyscBaner } from "./ekran.js";

import { zastosujStol } from "./stol.js";
import { fortunaAktora, nominalMonety, monetyStandardowe, monetyNieznane, wartoscMonety, opisSakiewki, iloscMonety, stanSakiewkiMP, rodzajKosci, analizujPostacWFRP } from "./karty.js";

// Aktywna gra (do ponownego wyslania stolu graczowi, ktory odswiezyl strone w trakcie meczu)
let aktywnaGra = null;
export function odswiezKlienta(userId) {
  if (aktywnaGra) aktywnaGra.odswiez(String(userId));
}

export async function uruchomPoker() {
  if (!game.user.isGM) {
    ui.notifications.warn("Kościany Poker może uruchomić tylko Mistrz Gry.");
    return;
  }
  await sprawdzPoprzedniMecz();
  const RealDialogV2 = foundry.applications.api.DialogV2;
  const czekaj = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const MAX_MIEJSC = 6;
  const TIMEOUT_ZAPYTANIA = 20 * 60 * 1000; // jak dlugo czekamy na odpowiedz gracza (ms)
  let zdalneWlaczone = false;
  let licznikZapytan = 0;
  let stolWlaczony = false; // stol do gry otwarty na ekranach MG i graczy
  let dsnWlaczone = true;   // kosci 3D (Dice So Nice)
  const idMeczu = Date.now().toString(36);

  // ---- ROZGLASZANIE DO WSZYSTKICH EKRANOW ----
  function emitSocket(dane) {
    try {
      game.socket.emit(KANAL_SOCKET, dane);
    } catch (err) {
      console.warn("Kościany Poker — nie udało się wysłać zdarzenia do graczy", err);
    }
  }

  // Animacja kubka widoczna na ekranie kazdego gracza
  async function animujKubek(imie, opis) {
    if (stolWlaczony) return; // przy stole animacja jest na stole
    emitSocket({ typ: "kubek", imie: imie, opis: opis });
    await animujKubekLokalnie(imie, opis);
  }

  // Duzy baner na ekranie MG i na ekranach graczy
  async function pokazWszystkim(o, ms) {
    emitSocket({ typ: "baner", o: o, ms: ms });
    await pokazBanerEkran(o, ms);
    emitSocket({ typ: "banerZamknij" });
  }

  // ---- OKNA OTWIERANE NA KOMPUTERACH GRACZY ----
  function czyZdalnie(g) {
    if (!zdalneWlaczone || !g || !g.userId || g.graMG || g.auto) return false;
    const u = game.users.get(g.userId);
    return Boolean(u && u.active && u.id !== game.user.id && typeof u.query === "function");
  }

  // Udaje przycisk okna: callbacki okien czytaja wartosci pol przez form.elements.namedItem
  function sztucznyPrzycisk(pola) {
    return { form: { elements: { namedItem: (n) => {
      if (!(n in pola)) return null;
      const v = pola[n];
      return typeof v === "boolean" ? { checked: v, value: v ? "on" : "" } : { value: v };
    } } } };
  }

  // Maly panel na ekranie MG podczas czekania na gracza, z przyciskiem pomijajacym
  function panelOczekiwania(g, tytul) {
    const el = document.createElement("div");
    el.id = "kp-oczekiwanie";
    el.style.cssText = "position:fixed; right:20px; bottom:20px; z-index:99997; padding:10px 14px; border:2px solid #e5c158; border-radius:8px; background:rgba(25, 20, 15, 0.96); color:#f0e6d2; font-size:13px; max-width:340px; box-shadow:0 6px 24px rgba(0,0,0,0.8);";
    const tekst = document.createElement("div");
    tekst.textContent = "Czekam na gracza: " + g.nazwa + " — " + tytul;
    tekst.style.cssText = "margin-bottom:8px;";
    const przycisk = document.createElement("button");
    przycisk.type = "button";
    przycisk.textContent = "Pomiń gracza";
    przycisk.style.cssText = "cursor:pointer; padding:4px 10px;";
    const obiekt = { naPomin: null, usun: () => el.remove() };
    przycisk.addEventListener("click", () => {
      if (obiekt.naPomin) obiekt.naPomin();
    });
    el.appendChild(tekst);
    el.appendChild(przycisk);
    document.body.appendChild(el);
    return obiekt;
  }

  // Wysyla okno do komputera gracza i czeka na odpowiedz; MG moze w kazdej chwili pominac gracza
  async function zapytajGracza(g, dane) {
    const user = game.users.get(g.userId);
    const id = Date.now().toString(36) + "-" + (++licznikZapytan);
    dane.id = id;
    const panel = panelOczekiwania(g, dane.tytul);
    const rozmowa = Promise.resolve()
      .then(() => user.query(NAZWA_ZAPYTANIA, dane, { timeout: TIMEOUT_ZAPYTANIA }))
      .then((r) => (r == null ? { status: "zamkniete" } : r))
      .catch((err) => ({ status: "blad", komunikat: String(err && err.message ? err.message : err) }));
    const pominiecie = new Promise((resolve) => {
      panel.naPomin = () => resolve({ status: "pominiete" });
    });
    const wynik = await Promise.race([rozmowa, pominiecie]);
    panel.usun();
    if (wynik.status === "pominiete") {
      emitSocket({ typ: "zamknij", id: id, userId: g.userId });
      g.pominiecieZGM = true;
    } else if (wynik.status === "blad") {
      ui.notifications.warn("Nie udało się otworzyć okna u gracza " + g.nazwa + ": " + wynik.komunikat + ". Możesz pominąć gracza.");
    }
    return wynik;
  }

  // Ostrzezenie dla gracza: na jego komputerze albo, gdy gra lokalnie, u MG
  function powiadomGracza(g, tekst) {
    if (czyZdalnie(g)) {
      Promise.resolve()
        .then(() => game.users.get(g.userId).query(NAZWA_ZAPYTANIA, { typ: "powiadom", tekst: tekst }, { timeout: 10000 }))
        .catch(() => {});
    } else {
      ui.notifications.warn(tekst);
    }
  }

  // Nakladka na DialogV2: okna z polem dla: (gracz) trafiaja na komputer gracza, reszta jak dotad na ekran MG.
  // Opcja zdalne: { tryb, parametry } mowi oknu gracza, jakie zachowanie ma wlaczyc (zadne funkcje nie sa wysylane).
  const DialogV2 = {
    async prompt(cfg) {
      const { dla, zdalne, autoOdp, ...reszta } = cfg;
      if (dla && dla.auto && autoOdp !== undefined) return await autoOdp();
      if (!dla || !czyZdalnie(dla)) return RealDialogV2.prompt(reszta);
      const dane = {
        typ: "prompt",
        tytul: cfg.window.title,
        tresc: cfg.content,
        szerokosc: cfg.position && cfg.position.width,
        ok: { label: cfg.ok && cfg.ok.label, icon: cfg.ok && cfg.ok.icon },
        tryb: (zdalne && zdalne.tryb) || "proste",
        parametry: (zdalne && zdalne.parametry) || {}
      };
      const odp = await zapytajGracza(dla, dane);
      if (!odp || odp.status !== "ok") return null;
      if (zdalne && zdalne.tryb === "panel" && odp.akcja && odp.akcja !== "ok") {
        if (zdalne.naAkcje) zdalne.naAkcje(odp.akcja);
        return null;
      }
      return cfg.ok.callback(null, sztucznyPrzycisk(odp.pola || {}));
    },
    async confirm(cfg) {
      const { dla, zdalne, autoOdp, ...reszta } = cfg;
      if (dla && dla.auto && autoOdp !== undefined) return await autoOdp();
      if (!dla || !czyZdalnie(dla)) return RealDialogV2.confirm(reszta);
      const dane = {
        typ: "confirm",
        tytul: cfg.window.title,
        tresc: cfg.content,
        tak: { label: cfg.yes && cfg.yes.label, icon: cfg.yes && cfg.yes.icon },
        nie: { label: cfg.no && cfg.no.label, icon: cfg.no && cfg.no.icon }
      };
      const odp = await zapytajGracza(dla, dane);
      if (!odp || odp.status !== "ok") return null;
      return odp.akcja === "yes";
    },
    wait: (cfg) => RealDialogV2.wait(cfg)
  };



  function szeptDoMG(trescHTML) {
    const gmIds = ChatMessage.getWhisperRecipients("GM").map((u) => u.id);
    if (gmIds.length === 0) return Promise.resolve();
    return ChatMessage.create({
      speaker: { alias: "Kronikarz Karczmy (MG)" },
      whisper: gmIds,
      content: '<div style="background:rgba(30, 15, 35, 0.92); border-left:3px solid #a855f7; padding:6px 8px; color:#f3e8ff; font-size:12px;">' + trescHTML + '</div>'
    });
  }

  function szeptDoGraczaIMG(userId, trescHTML) {
    const odbiorcy = new Set(ChatMessage.getWhisperRecipients("GM").map((u) => u.id));
    if (userId) odbiorcy.add(userId);
    const lista = Array.from(odbiorcy);
    if (lista.length === 0) return Promise.resolve();
    return ChatMessage.create({
      speaker: { alias: "Wyczucie Hazardzisty" },
      whisper: lista,
      content: '<div style="background:rgba(15, 30, 40, 0.92); border-left:3px solid #38bdf8; padding:6px 8px; color:#e0f2fe; font-size:12px;">' + trescHTML + '</div>'
    });
  }


  // ---- PRYWATNOSC KOSCI: kazdy gracz widzi tylko wlasne rzuty (plus MG) ----
  function odbiorcyGracza(g) {
    const ids = new Set(ChatMessage.getWhisperRecipients("GM").map((u) => u.id));
    if (g.userId) ids.add(g.userId);
    return Array.from(ids);
  }

  // Prywatna reka (szept do wlasciciela i MG)
  function szeptReke(g, kosci, tytul) {
    stolReka(g, kosci);
    const lista = odbiorcyGracza(g);
    if (lista.length === 0) return Promise.resolve();
    let kosciHTML = "";
    for (const k of kosci) kosciHTML += rysujKoscHTML(k, true);
    return ChatMessage.create({
      speaker: { alias: "Twoje kości (" + g.nazwa + ")" },
      whisper: lista,
      content: '<div style="background:rgba(15, 30, 40, 0.92); border-left:3px solid #38bdf8; padding:6px 8px; color:#e0f2fe; font-size:12px;">' +
        '<div style="margin-bottom:4px;"><strong>' + esc(g.nazwa) + '</strong> — ' + tytul + '</div>' +
        '<div style="display:flex; gap:4px; justify-content:center;">' + kosciHTML + '</div></div>'
    });
  }

  // Rzut 3D: domyslnie ukryty (tylko wlasciciel postaci i MG); publiczny=true pokazuje wszystkim
  async function pokazKosci3D(rzut, g, pauzaMs, publiczny) {
    if (!game.dice3d || !dsnWlaczone) {
      if (stolWlaczony && pauzaMs) await czekaj(Math.min(pauzaMs, 1500)); // czas na animacje kosci na stole (lot trwa ok. 1,5 s)
      return;
    }
    const rzucajacy = (g.userId && game.users.get(g.userId)) || game.user;
    if (publiczny) {
      await game.dice3d.showForRoll(rzut, rzucajacy, true);
    } else {
      await game.dice3d.showForRoll(rzut, rzucajacy, true, odbiorcyGracza(g));
    }
    await czekaj(pauzaMs);
  }

  // Jawna reka na czacie publicznym (pierwszy rzut)
  function publicznaReka(g, kosci, tytul) {
    let kosciHTML = "";
    for (const k of kosci) kosciHTML += rysujKoscHTML(k, true);
    return ChatMessage.create({
      speaker: { alias: g.nazwa },
      content: '<div style="background:rgba(25, 20, 15, 0.92); border-left:3px solid #e5c158; padding:6px 8px; color:#f0e6d2; font-size:12px;">' +
        '<div style="margin-bottom:4px;"><strong>' + esc(g.nazwa) + '</strong> — ' + tytul + '</div>' +
        '<div style="display:flex; gap:4px; justify-content:center;">' + kosciHTML + '</div></div>'
    });
  }


  // Okno wymiany kosci (zwraca tablice indeksow albo null po zamknieciu)
  function okienkoWymiany(g, stan, numerRundy, naglowekHTML) {
    let kosciWyborHTML = "";
    for (let idx = 0; idx < stan.kosci.length; idx++) {
      const k = stan.kosci.at(idx);
      kosciWyborHTML += '<label class="poker-die-label" style="cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:6px; user-select:none;">' +
        '<input type="checkbox" name="reroll_' + idx + '" style="display:none;" />' +
        rysujKoscHTML(k, false) +
        '<span class="poker-die-tag" style="font-size:11px; color:#ccc; font-weight:bold;">(' + k + ') ZOSTAW</span>' +
        '</label>';
    }
    return DialogV2.prompt({
      window: { title: "Kościany Poker — Wymiana: " + g.nazwa },
      content: '<div style="text-align:center; padding:6px 4px;">' +
        (naglowekHTML || '<div style="font-size:13px; color:#e5c158; margin-bottom:4px;">Runda ' + numerRundy + ' — Wymiana kości: <strong>' + g.nH + '</strong></div>') +
        '<p style="margin-bottom:6px; font-size:15px;">Twój pierwszy rzut: <strong style="color:#7ae582;">' + stan.uklad.nazwa + '</strong></p>' +
        '<p style="margin-bottom:12px; font-size:12px; opacity:0.9;">Kliknij kości, które chcesz <strong>wymienić</strong>. Wynik wymiany zobaczysz tylko Ty (i MG).</p>' +
        '<div style="display:flex; justify-content:center; gap:12px; margin-bottom:8px;">' + kosciWyborHTML + '</div>' +
        '</div>',
      render: renderWyboruKosci,
      dla: g,
      zdalne: { tryb: "wymiana" },
      ok: {
        label: "Potrząśnij kubkiem i wymień zaznaczone",
        icon: "fa-solid fa-dice",
        callback: (event, button) => {
          const doPrzerzutu = [];
          for (let i = 0; i < 5; i++) {
            const cb = button.form.elements.namedItem("reroll_" + i);
            if (cb && cb.checked) doPrzerzutu.push(i);
          }
          return doPrzerzutu;
        }
      },
      rejectClose: false
    });
  }

  // Czy postac stac na kwote (bez automatycznych monet / bez karty - zawsze tak)
  function stacNa(g, kwotaMP) {
    if (!autoMonety || !g.actor) return true;
    return (pobierzStanSakiewkiMP(g.actor) ?? 0) >= kwotaMP;
  }

  // Sakiewka w MP; Infinity, gdy monety nie sa pobierane z kart albo postac nie ma karty
  function portfelMP(g) {
    if (!autoMonety || !g.actor) return Infinity;
    return pobierzStanSakiewkiMP(g.actor) ?? 0;
  }

  // Szuler Koscianny: gracz sam wskazuje, ktore z rzuconych kosci trafiaja do reki.
  // Domyslnie zaznaczony jest najlepszy wybor; zamkniecie okna = wybor automatyczny (nie przerywa meczu).
  async function wyborZPuli(g, zachowane, pula, ile) {
    const auto = najlepszeZPuli(zachowane, pula, ile);
    if (g.auto) return auto.indeksy;
    let zachowaneHTML = "";
    for (const k of zachowane) zachowaneHTML += rysujKoscHTML(k, true);
    let pulaHTML = "";
    pula.forEach((k, idx) => {
      pulaHTML += '<label class="poker-pula-label" style="cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:6px; user-select:none;">' +
        '<input type="checkbox" name="pula_' + idx + '"' + (auto.indeksy.includes(idx) ? " checked" : "") + ' style="display:none;" />' +
        rysujKoscHTML(k, false) +
        '<span class="poker-pula-tag" style="font-size:11px; font-weight:bold;"></span></label>';
    });
    const tresc = '<div style="text-align:center; padding:6px 4px;">' +
      '<div style="font-size:13px; color:#e5c158; margin-bottom:4px;">Szuler Kościany: <strong>' + g.nH + '</strong></div>' +
      '<p style="margin-bottom:6px; font-size:13px;">Rzuciłeś <strong>' + pula.length + '</strong> kości zamiast ' + ile + '. Wskaż dokładnie <strong>' + ile + '</strong>, które trafią do ręki (zaznaczone jest najlepsze rozwiązanie; kliknij inną kość, aby zamienić ją z najdawniej zaznaczoną).</p>' +
      (zachowane.length > 0 ? '<p style="margin:4px 0; font-size:11px; opacity:0.85;">Zachowane kości:</p><div style="display:flex; justify-content:center; gap:5px; margin-bottom:8px;">' + zachowaneHTML + '</div>' : '') +
      '<div style="display:flex; justify-content:center; gap:12px; margin-bottom:8px;">' + pulaHTML + '</div>' +
      '<p id="poker-podglad" style="font-size:14px; color:#7ae582; min-height:20px;"></p></div>';

    for (let proba = 0; proba < 5; proba++) {
      const wynik = await DialogV2.prompt({
        window: { title: "Szuler Kościany — wybierz kości z puli" },
        content: tresc,
        render: (event, dialog) => renderWyboruZPuli(dialog, { pula, zachowane, ile }),
        dla: g,
        zdalne: { tryb: "pula", parametry: { pula: pula, zachowane: zachowane, ile: ile } },
        ok: {
          label: "Zatwierdź wybór",
          icon: "fa-solid fa-check",
          callback: (event, button) => {
            const idx = [];
            for (let i = 0; i < pula.length; i++) {
              const cb = button.form.elements.namedItem("pula_" + i);
              if (cb && cb.checked) idx.push(i);
            }
            return idx;
          }
        },
        rejectClose: false
      });
      if (wynik === null) return auto.indeksy;
      if (wynik.length === ile) return wynik;
      powiadomGracza(g, "Zaznacz dokładnie " + ile + " kości (zaznaczono " + wynik.length + ").");
    }
    return auto.indeksy;
  }

  // Rzut k6 (n kosci). Gracz z aktywnymi obciazonymi koscmi losuje z puli wazonej (animacja 3D pokazuje ten sam wynik)
  async function rzucK6(ile, g) {
    const rzut = await new Roll(ile + "d6").evaluate();
    if (g && g.kosciObciazone) {
      for (const r of rzut.terms.at(0).results) {
        const los = (globalThis.CONFIG && CONFIG.Dice && CONFIG.Dice.randomUniform) ? CONFIG.Dice.randomUniform() : Math.random();
        r.result = koscObciazona(g.kosciObciazone.ulubiona, los);
      }
    }
    return rzut;
  }

  // Ukryty przerzut jednej kosci (Szczescie, Przewaga Hazardu)
  async function przerzutUkryty(g, stan, indeks, opis) {
    await animujKubek(g.nazwa, opis);
    const rzut = await rzucK6(1, g);
    stolAnimujUkryte(g, stan.kosci, [indeks]);
    await pokazKosci3D(rzut, g, 1500);
    const nowyWynik = rzut.terms.at(0).results.at(0).result;
    stan.kosci.splice(indeks, 1, nowyWynik);
    stan.uklad = ocenUklad(stan.kosci);
    await szeptReke(g, stan.kosci, "aktualna ręka: <strong>" + stan.uklad.nazwa + "</strong>");
  }

  // ---- Szczescie: Punkty Szczescia (Fortuna) z karty postaci; bez karty / bez pola Fortuny - ladunki z talentu ----

  function szczescieDostepne(g) {
    const f = fortunaAktora(g.actor);
    return f !== null ? f : (g.statystyki.szczescieMax - g.szczescieUzyte);
  }

  async function zuzyjSzczescie(g) {
    const f = fortunaAktora(g.actor);
    if (f !== null) await g.actor.update({ "system.status.fortune.value": Math.max(0, f - 1) });
    g.szczescieUzyte += 1;
  }

  // ---- Oszustwo: wspolna obsluga prob (Oszukaj, Obciazone kosci) ----
  function celObserwatora(r) {
    const st = r.graczObj.statystyki;
    return Math.max(st.percepcjaWartosc, st.intuicjaWartosc) || 35;
  }

  // Cel testu Zwinnych Palcow (bez rzutu): umiejetnosc (albo Zrecznosc) + modyfikatory.
  // Modyfikatory: warunki przy stole, kolejna proba w meczu (-10 za kazda), kara za laczenie metod oszustwa.
  function skladOszustwa(g, dodatkowaKara) {
    const s = g.statystyki;
    const linie = [];
    let mod = warunkiMod;
    if (warunkiMod !== 0) linie.push("warunki przy stole " + (warunkiMod > 0 ? "+" : "−") + Math.abs(warunkiMod));
    if (g.probyOszustw > 0) {
      mod -= 10 * g.probyOszustw;
      linie.push("kolejna próba w tym meczu −" + (10 * g.probyOszustw));
    }
    if (dodatkowaKara) {
      mod -= dodatkowaKara;
      linie.push("łączenie metod oszustwa −" + dodatkowaKara);
    }
    return { cel: Math.max(1, s.zwinnePalceWartosc + mod), mod: mod, linie: linie, baza: s.zwinnePalceWartosc, maUmiejetnosc: s.maZwinnePalce };
  }

  // Test przeciwstawny: oszust kontra kazdy rywal osobno
  async function probaOszustwa(g, stan, stanyRundy, dodatkowaKara) {
    const s = g.statystyki;
    const sk = skladOszustwa(g, dodatkowaKara);
    g.probyOszustw += 1;
    const rzutO = await new Roll("1d100").evaluate();
    const obserwatorzy = [];
    for (const r of stanyRundy.filter((x) => x !== stan && !x.graczObj.wyrzucony)) {
      const rz = await new Roll("1d100").evaluate();
      obserwatorzy.push({ nazwa: r.graczObj.nazwa, rzut: rz.total, cel: Math.max(1, celObserwatora(r) - karaSzybkichRak(s.szybkieRekePoziom)) });
    }
    const wynik = rozstrzygnijOszustwo({ rzut: rzutO.total, cel: sk.cel, premiaPS: s.szybkieRekePoziom, szuler: s.szulerPoziom }, obserwatorzy);
    wynik.cel = sk.cel;
    wynik.mod = sk.mod;
    wynik.skladniki = sk.linie;
    wynik.rzutOszusta = rzutO.total;
    wynik.premiaPS = s.szybkieRekePoziom;
    wynik.karaObserwatorow = karaSzybkichRak(s.szybkieRekePoziom);
    return wynik;
  }

  function opisTestuOszusta(w) {
    const obs = w.szczegoly.map((o) => esc(o.nazwa) + " " + o.rzut + "/" + o.cel + " (PS " + o.sl + ")").join(", ") || "brak obserwatorów";
    return "Oszust: rzut <strong>" + w.rzutOszusta + "</strong> na cel <strong>" + w.cel + "</strong> (modyfikator " + (w.mod >= 0 ? "+" : "") + w.mod + "), PS " + w.test.sl +
      (w.test.jednosci ? " (Szuler Kościany: PS z kości jedności)" : "") +
      ((w.test.sukces && w.premiaPS) ? " +" + w.premiaPS + " z talentu Szybkie Ręce" : "") + " = <strong>" + w.slOszusta + "</strong>. Obserwatorzy: " + obs + (w.karaObserwatorow ? " (Szybkie Ręce: −" + w.karaObserwatorow + " do ich testu)" : "") + ".";
  }

  // Raport z rzutu dla gracza: jego wlasny rzut, cel, PS i talenty (rzuty rywali zostaja tajemnica)
  function opisWynikuDlaGracza(w) {
    const zwykle = wynikTestu(w.cel, w.rzutOszusta);
    const linie = [];
    linie.push("Twój rzut: <strong>" + w.rzutOszusta + "</strong> na cel <strong>" + w.cel + "</strong>" +
      (w.skladniki && w.skladniki.length ? " (" + w.skladniki.join(", ") + ")" : "") + " — " + (w.test.sukces ? "test zdany" : "test oblany") + ".");
    if (w.rzutOszusta <= 5) linie.push("Rzut 01–05: automatyczny sukces.");
    if (w.rzutOszusta >= 96) linie.push("Rzut 96–00: automatyczna porażka — to zawsze kończy się przyłapaniem.");
    let ps = "Poziomy Sukcesu: " + zwykle.sl;
    if (w.test.jednosci) ps += " → Szuler Kościany: cyfra jedności rzutu daje " + w.test.sl;
    if (w.test.sukces && w.premiaPS) ps += ", Szybkie Ręce +" + w.premiaPS;
    ps += " = <strong>" + w.slOszusta + " PS</strong>.";
    linie.push(ps);
    return linie.join("<br/>");
  }

  async function szeptWynikOszustwa(g, w, naglowek, skutek) {
    await szeptDoGraczaIMG(g.userId, "<strong>[" + naglowek + "]</strong><br/>" + opisWynikuDlaGracza(w) + "<br/><strong>" + skutek + "</strong>");
  }

  // Ostrzezenie przed proba oszustwa: cel testu, szansa wlasnego testu, zasady i skutki kazdego wyniku
  function ostrzezenieOszustwaHTML(g, stan, stanyRundy, dodatkowaKara, skutekSukcesu, dodatkoweRyzyko) {
    const s = g.statystyki;
    const sk = skladOszustwa(g, dodatkowaKara);
    const rywali = stanyRundy.filter((x) => x !== stan && !x.graczObj.wyrzucony).length;
    const szansa = Math.min(95, Math.max(5, sk.cel));
    const podstawa = sk.maUmiejetnosc
      ? "Zwinne Palce " + sk.baza + "%"
      : "brak umiejętności Zwinne Palce — test na Zręczności " + sk.baza + "%";
    const talenty = [];
    if (s.szulerPoziom > 0) talenty.push("<li><strong>Szuler Kościany:</strong> przy zdanym teście PS może pochodzić z cyfry jedności rzutu (rzut 06 to +6 PS), jeśli to więcej niż normalnie.</li>");
    if (s.szybkieRekePoziom > 0) talenty.push("<li><strong>Szybkie Ręce:</strong> +" + s.szybkieRekePoziom + " PS przy zdanym teście Zwinnych Palców.</li>");
    return '<div style="background:rgba(120, 20, 20, 0.35); border:1px solid #ef4444; border-radius:6px; padding:8px; margin-bottom:10px; font-size:12px; text-align:left;">' +
      '<strong style="color:#fca5a5;">UWAGA — to ryzykowny ruch!</strong>' +
      '<ul style="margin:6px 0 0 16px; padding:0;">' +
      '<li><strong>Twój test:</strong> ' + podstawa + (sk.linie.length ? " (" + sk.linie.join(", ") + ")" : "") + ' = cel <strong>' + sk.cel + '%</strong>. ' +
      'Własny test zdasz z szansą około <strong>' + szansa + '%</strong> (rzut 01–05 zawsze się udaje, 96–00 zawsze oblewa).</li>' +
      talenty.join("") +
      '<li><strong>Test przeciwstawny:</strong> każdy z ' + rywali + ' rywali rzuca osobno na Percepcję lub Intuicję. Liczy się porównanie Poziomów Sukcesu, nie samo zdanie testu.</li>' +
      '<li><strong>Wygrana</strong> (więcej PS niż każdy rywal): ' + skutekSukcesu + '</li>' +
      '<li><strong>Remis</strong> w PS z którymś rywalem (nikt wyżej): nic się nie zmienia i nikt niczego nie zauważa, ale próba jest zużyta.</li>' +
      '<li style="color:#fca5a5;"><strong>Przegrana</strong> (któryś rywal ma więcej PS) albo Twój rzut 96–00: zostajesz <strong>przyłapany</strong> — odpadasz z tej rundy i z całego meczu, wpłacone dotąd <strong>' + formatujWaluteWFRP(g.wplacono) + '</strong> zostaje w puli, a MG dostaje sugestię konsekwencji (bójka, wyrzucenie z karczmy, trwała łatka szulera).</li>' +
      (dodatkoweRyzyko ? '<li style="color:#fca5a5;">' + dodatkoweRyzyko + '</li>' : '') +
      '</ul>' +
      '<p style="margin:6px 0 0 0; opacity:0.85;">Zamknięcie tego okna anuluje próbę — nic nie jest rzucane i nic nie zostaje zużyte.</p></div>';
  }

  // Okno podmiany kosci (Oszukaj): ostrzezenie, wybor kosci i oczka; nie pozwala wybrac wartosci, ktora kosc juz ma
  async function oknoOszukaj(g, stan, stanyRundy, dodatkowaKara, podmianyZuzyte, limitPodmian) {
    const ostrzezenie = ostrzezenieOszustwaHTML(g, stan, stanyRundy, dodatkowaKara,
      "wskazana kość zmienia się po cichu na wybrane oczko. Podmiany w tej turze: " + podmianyZuzyte + " z " + limitPodmian + ".", null);
    for (let proba = 0; proba < 5; proba++) {
      const wybor = await DialogV2.prompt({
        window: { title: "Oszukiwanie przy stole — " + g.nazwa },
        position: { width: 500 },
        content: '<div style="padding:8px; font-size:13px;">' + ostrzezenie +
          '<p>Wybierz kość do podmiany oraz oczko, na które chcesz ją po cichu przekręcić:</p>' +
          '<div style="display:flex; gap:10px; margin-top:8px;">' +
          '<label style="flex:1;">Kość nr:<select name="die_idx" style="width:100%; margin-top:4px;">' +
          stan.kosci.map((k, idx) => '<option value="' + idx + '">Kość #' + (idx + 1) + ' (obecnie: ' + k + ')</option>').join("") +
          '</select></label>' +
          '<label style="flex:1;">Nowe oczko:<select name="new_val" style="width:100%; margin-top:4px;">' +
          '<option value="6">6</option><option value="5">5</option><option value="4">4</option><option value="3">3</option><option value="2">2</option><option value="1">1</option>' +
          '</select></label></div></div>',
        render: (event, dialog) => renderOszukaj(dialog, { kosci: stan.kosci }),
        dla: g,
        zdalne: { tryb: "oszukaj", parametry: { kosci: stan.kosci } },
        ok: {
          label: "Ryzykuję — podmień kość",
          icon: "fa-solid fa-mask",
          callback: (event, button) => ({
            idx: Number(button.form.elements.namedItem("die_idx")?.value) || 0,
            val: Number(button.form.elements.namedItem("new_val")?.value) || 6
          })
        },
        rejectClose: false
      });
      if (!wybor) return null;
      if (stan.kosci.at(wybor.idx) === wybor.val) {
        powiadomGracza(g, "Kość #" + (wybor.idx + 1) + " ma już oczko " + wybor.val + " — wybierz inną wartość.");
        continue;
      }
      return wybor;
    }
    return null;
  }

  // Okno wprowadzenia obciazonych kosci: ostrzezenie i wybor faworyzowanego oczka
  async function oknoObciazone(g, stan, stanyRundy, dodatkowaKara) {
    const ostrzezenie = ostrzezenieOszustwaHTML(g, stan, stanyRundy, dodatkowaKara,
      "obciążone kości trafiają do kubka, a Twoje kolejne rzuty (pierwszy rzut i wymiany) faworyzują wybrane oczko do końca meczu lub do wykrycia.",
      "Dodatkowe ryzyko: przed rozstrzygnięciem każdej rundy rywale próbują zauważyć obciążone kości (kara −20, bez kary gdy mają zestaw do gry w kości albo Hazard 40+). Wykrycie kończy się przyłapaniem jak wyżej i konfiskatą kości.");
    return DialogV2.prompt({
      dla: g,
      window: { title: "Obciążone kości — " + g.nazwa },
      position: { width: 500 },
      content: '<div style="padding:8px; font-size:13px;">' + ostrzezenie +
        '<label style="display:block; margin-top:8px;">Faworyzowane oczko:<select name="fav" style="width:100%; margin-top:4px;"><option value="6">6 (więcej szóstek)</option><option value="1">1 (więcej jedynek)</option></select></label></div>',
      ok: {
        label: "Ryzykuję — wprowadź obciążone kości",
        icon: "fa-solid fa-dice",
        callback: (event, button) => Number(button.form.elements.namedItem("fav")?.value) || 6
      },
      rejectClose: false
    });
  }

  const KARY_PRZYLAPANIA = {
    1: "Rywale wyśmiewają oszusta i wyrzucają go od stołu.",
    2: "Stół reaguje agresywnie: zwrot poprzednich wygranych albo bójka na pięści.",
    3: "Wybuch awantury: dobyta broń, a szuler dostaje trwałą łatę w tej lokacji."
  };

  async function skonfiskujObciazone(g) {
    g.kosciObciazone = null;
    if (!g.actor) return;
    const it = g.actor.items.find((i) => rodzajKosci(i) === "obciazone");
    if (!it) return;
    const n = Math.max(0, iloscMonety(it) - 1);
    if (typeof it.system.quantity === "object") await it.update({ "system.quantity.value": n });
    else await it.update({ "system.quantity": n });
  }

  // Przylapanie: odpada z rundy i z meczu, stawka zostaje w puli, czat ujawnia szczegoly, MG dostaje sugestie
  async function przylapanyOszust(g, stan, wynik, opisCzynu, konfiskata) {
    stan.zdyskwalifikowany = true;
    g.wyrzucony = true;
    ustawKomunikat("SKANDAL! " + (wynik.przylapal ? wynik.przylapal : "Cały stół") + " złapał " + g.nazwa + " za rękę — " + g.nazwa + " odpada z gry.");
    const lapacz = wynik.przylapal ? esc(wynik.przylapal) : "Cały stół";
    const kara = KARY_PRZYLAPANIA[wynik.stopien] || KARY_PRZYLAPANIA[1];
    await szeptDoMG("<strong>[ZŁAPANY NA OSZUSTWIE!]</strong> " + g.nH + " (stopień " + wynik.stopien + "). Sugestia dla MG: " + kara);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker(),
      content: '<div style="background:rgba(120, 20, 20, 0.92); border:2px solid #ef4444; border-radius:8px; padding:10px; color:#fee2e2; text-align:center;">' +
        (wynik.test && wynik.test.auto === "porazka" ? opisPechu(wynik.rzutOszusta) + "<br/>" : "") + '<strong>SKANDAL PRZY STOLE!</strong><br/>' + lapacz + ' złapał <strong>' + g.nH + '</strong> za rękę, ' + opisCzynu + '!<br/>' +
        g.nH + ' odpada z gry, a jego stawka zostaje w puli.<br/><em>' + kara + '</em></div>'
    });
    if (konfiskata) await skonfiskujObciazone(g);
  }

  // Okno z reczna kwota (ZK / SS / MP); zwraca sume w MP albo null po zamknieciu
  async function pytanieOKwote(g, tytul, opis, etykieta, kwotaAutomatu) {
    return DialogV2.prompt({
      dla: g,
      autoOdp: () => (kwotaAutomatu !== undefined ? kwotaAutomatu : (stawkaMP > 0 ? stawkaMP : 12)),
      window: { title: tytul },
      content: '<div style="padding:8px; font-size:13px;"><p style="margin-bottom:8px;">' + opis + '</p>' +
        '<div style="display:flex; gap:8px;">' +
        '<label style="flex:1; text-align:center;"><span style="color:#ffd700; font-weight:bold;">ZK</span><input type="number" name="bet_zk" value="0" min="0" style="width:100%; text-align:center; margin-top:4px;" /></label>' +
        '<label style="flex:1; text-align:center;"><span style="color:#d8d8d8; font-weight:bold;">SS</span><input type="number" name="bet_ss" value="0" min="0" style="width:100%; text-align:center; margin-top:4px;" /></label>' +
        '<label style="flex:1; text-align:center;"><span style="color:#cd7f32; font-weight:bold;">MP</span><input type="number" name="bet_mp" value="0" min="0" style="width:100%; text-align:center; margin-top:4px;" /></label>' +
        '</div></div>',
      ok: {
        label: etykieta,
        icon: "fa-solid fa-coins",
        callback: (event, button) => {
          const zk = Math.max(0, Math.floor(Number(button.form.elements.namedItem("bet_zk")?.value) || 0));
          const ss = Math.max(0, Math.floor(Number(button.form.elements.namedItem("bet_ss")?.value) || 0));
          const mp = Math.max(0, Math.floor(Number(button.form.elements.namedItem("bet_mp")?.value) || 0));
          return (zk * 240) + (ss * 12) + mp;
        }
      },
      rejectClose: false
    });
  }

  // Wybor konkretnego rywala (zwraca stan rywala albo null po anulowaniu)
  async function wybierzRywala(g, kandydaci, tytul, opis, etykieta) {
    if (kandydaci.length === 0) return null;
    if (kandydaci.length === 1) return kandydaci.at(0);
    let opcje = "";
    kandydaci.forEach((k, i) => {
      opcje += '<label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; cursor:pointer;">' +
        '<input type="radio" name="cel" value="' + i + '"' + (i === 0 ? " checked" : "") + ' /><span><strong>' + esc(k.graczObj.nazwa) + '</strong></span></label>';
    });
    const idx = await DialogV2.prompt({
      dla: g,
      window: { title: tytul },
      content: '<div style="padding:8px; font-size:13px;"><p style="margin-bottom:8px;">' + opis + '</p>' + opcje + '</div>',
      ok: {
        label: etykieta,
        icon: "fa-solid fa-bullseye",
        callback: (event, button) => Number(button.form.elements.namedItem("cel")?.value) || 0
      },
      rejectClose: false
    });
    if (idx === null) return null;
    return kandydaci.at(idx);
  }

  // ---- STOL DO GRY: stan wspolny dla wszystkich ekranow ----
  const stolKosci = new Map();   // gracz -> { tryb: brak|jawne|ukryte|odkryte, kosci, uklad, zwyciezca }
  let stolFn = null;             // { fn: () => wpisy statusow, gracze: lista graczy w tej samej kolejnosci }
  let stolSrodek = { etykieta: "KOŚCIANY POKER", rola: "", imie: "", nastepnyHTML: "" };
  let stolKomunikat = "";
  let stolDzwiek = null;         // {id, typ}: dzwiek odtwarzany na kazdym ekranie (zetony, gong); kosci graja z animacji
  const stolHistoria = [];        // ostatnie zdarzenia (tylko publiczne komunikaty), najnowsze na koncu
  let stolAnimacja = null;
  let stolLicznik = 0;
  let stolKoniec = false;
  let ostatniStanStolu = null;

  const tekstZHtml = (h) => String(h == null ? "" : h).replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

  // Stan do wyslania wszystkim (bez ukrytych kosci) i osobno rece widoczne tylko dla MG
  function stanStolu() {
    const statusy = new Map();
    if (stolFn) {
      try {
        const w = stolFn.fn();
        stolFn.gracze.forEach((g, i) => { if (w[i]) statusy.set(g, w[i]); });
      } catch (err) {
        console.warn("Kościany Poker — nie udało się odczytać statusów stołu", err);
      }
    }
    const reki = {};
    const miejsca = gracze.map((g, i) => {
      const s = statusy.get(g) || (g.wyrzucony ? { typ: "out", tekst: "WYRZUCONY" } : { typ: "wait", tekst: "czeka" });
      const d = stolKosci.get(g) || { tryb: "brak", kosci: [], uklad: "", zwyciezca: false };
      let tryb = d.tryb;
      if (s.typ === "out") tryb = "out";
      else if (s.typ === "pas") tryb = "pas";
      const jawne = tryb === "jawne" || tryb === "odkryte";
      if (tryb === "ukryte") reki[String(i)] = [...d.kosci];
      return {
        nazwa: g.nazwa,
        token: g.token,
        wplacono: g.wplacono > 0 ? formatujWaluteWFRP(g.wplacono) : "",
        allIn: Boolean(g.allIn),
        podbil: Boolean(g.podbil),
        userId: g.userId || null,
        typ: s.typ,
        tekst: s.tekst,
        tryb: tryb,
        kosci: jawne ? [...d.kosci] : null,
        ukryte: tryb === "ukryte" ? d.kosci.length : 0,
        uklad: jawne ? (d.uklad || "") : "",
        zwyciezca: Boolean(d.zwyciezca)
      };
    });
    const stan = {
      mecz: idMeczu,
      etykieta: stolSrodek.etykieta,
      rola: stolSrodek.rola,
      imie: stolSrodek.imie,
      nastepnyHTML: stolSrodek.nastepnyHTML,
      pula: formatujWaluteWFRP(calaPulaMP),
      komunikat: stolKomunikat,
      historia: [...stolHistoria],
      dzwiek: stolDzwiek,
      koniec: stolKoniec,
      miejsca: miejsca,
      animacja: stolAnimacja
    };
    return { stan: stan, reki: reki };
  }

  async function stolOdswiez() {
    if (!stolWlaczony) return;
    const { stan, reki } = stanStolu();
    ostatniStanStolu = stan;
    emitSocket({ typ: "stol", stan: stan });
    zastosujStol({ ...stan, rekiMG: reki }, { lokalny: true });
  }

  // Dzwiek na stole: kazdy klient odtwarza go u siebie (o ile ma dzwieki wlaczone w ustawieniach modulu)
  function zagrajDzwiek(typ) {
    if (!stolWlaczony) return;
    stolDzwiek = { id: idMeczu + "-d" + (++stolLicznik), typ: typ };
    void stolOdswiez();
  }

  // Komunikat na stole: wpis w historii (ostatnie 5, bez powtorzen pod rzad) i biezaca linia pod pula
  function zapiszKomunikat(tekst) {
    stolKomunikat = String(tekst);
    if (stolKomunikat !== "" && stolHistoria.at(-1) !== stolKomunikat) {
      stolHistoria.push(stolKomunikat);
      if (stolHistoria.length > 5) stolHistoria.shift();
    }
  }

  function ustawKomunikat(tekst) {
    if (!stolWlaczony) return;
    zapiszKomunikat(tekst);
    void stolOdswiez();
  }

  // Wlasna ukryta reka trafia tylko do wlasciciela postaci (zapytanie do jego klienta); MG widzi ja przyciskiem na stole
  function przeslijReke(g, kosci) {
    if (!g || !g.userId || g.graMG || g.auto) return;
    const u = game.users.get(g.userId);
    if (!u || !u.active || u.id === game.user.id || typeof u.query !== "function") return;
    Promise.resolve()
      .then(() => u.query(NAZWA_ZAPYTANIA, { typ: "reka", kosci: [...kosci] }, { timeout: 15000 }))
      .catch(() => {});
  }

  function stolReka(g, kosci) {
    if (!stolWlaczony) return;
    stolKosci.set(g, { tryb: "ukryte", kosci: [...kosci], uklad: "", zwyciezca: false });
    void stolOdswiez();
    przeslijReke(g, kosci);
  }

  // indeksy: miejsca w rece (0-4) kosci, ktore leca na stol; tak animacja obejmuje dokladnie wymieniane kosci
  function stolAnimujUkryte(g, kosci, indeksy) {
    if (!stolWlaczony) return;
    stolKosci.set(g, { tryb: "ukryte", kosci: [...kosci], uklad: "", zwyciezca: false });
    stolAnimacja = { id: idMeczu + "-" + (++stolLicznik), miejsce: gracze.indexOf(g), rodzaj: "wymiana", ile: indeksy.length, indeksy: [...indeksy] };
    void stolOdswiez();
  }

  function stolRzutJawny(g, kosci, uklad) {
    if (!stolWlaczony) return;
    stolKosci.set(g, { tryb: "jawne", kosci: [...kosci], uklad: uklad.nazwa, zwyciezca: false });
    stolAnimacja = { id: idMeczu + "-" + (++stolLicznik), miejsce: gracze.indexOf(g), rodzaj: "rzut", ile: kosci.length };
    zapiszKomunikat(g.nazwa + " rzuca: " + uklad.nazwa + ".");
    void stolOdswiez();
  }

  function odswiezKlientaWewn(userId) {
    if (!stolWlaczony || !ostatniStanStolu) return;
    emitSocket({ typ: "stol", stan: ostatniStanStolu });
    const g = gracze.find((x) => x.userId === userId);
    const d = g && stolKosci.get(g);
    if (g && d && d.tryb === "ukryte") przeslijReke(g, d.kosci);
  }

  // Baner tury: przy stole aktualizuje stol, bez stolu - duzy baner na ekranach + wpis na czacie
  async function ogloszTure(o) {
    if (stolWlaczony) {
      stolSrodek = { etykieta: o.etykieta, rola: o.rola, imie: o.imie, nastepnyHTML: o.nastepnyHTML || "" };
      stolFn = (o.wpisyFn && o.gracze) ? { fn: o.wpisyFn, gracze: o.gracze } : null;
      await stolOdswiez();
      await czekaj(500);
      return;
    }
    await ChatMessage.create({ speaker: { alias: "Kościany Poker" }, content: banerHTML(o) });
    await pokazWszystkim(o, czasBaneru * 1000);
  }

  async function ogloszRunde(numer, pulaMP, gracze2) {
    for (const gr of gracze) { gr.allIn = false; gr.podbil = false; } // znaczniki ALL-IN i podbicia dotycza jednej rundy
    if (stolWlaczony) {
      stolKosci.clear();
      stolKomunikat = "";
      zapiszKomunikat("— Runda " + numer + " —");
      stolKomunikat = "";
      stolAnimacja = null;
      stolSrodek = { etykieta: "KOŚCIANY POKER", rola: "", imie: "RUNDA " + numer, nastepnyHTML: "" };
      stolFn = { fn: () => gracze2.map((g2) => ({ nazwa: g2.nazwa, typ: "wait", tekst: "w grze" })), gracze: gracze2 };
      await stolOdswiez();
      await czekaj(1200);
      return;
    }
    const o = {
      etykieta: "KOŚCIANY POKER",
      rola: "",
      imie: "RUNDA " + numer,
      nastepnyHTML: "Pula na stole: <strong>" + formatujWaluteWFRP(pulaMP) + "</strong>",
      wpisy: gracze2.map((g2) => ({ nazwa: g2.nazwa, typ: "wait", tekst: "w grze" }))
    };
    await ChatMessage.create({ speaker: { alias: "Kościany Poker" }, content: banerHTML(o) });
    await pokazWszystkim(o, Math.round(czasBaneru * 1250));
  }

  // Komunikat zdarzenia przy stole (pas, all-in, doplata); glowny i dodatek musza byc juz escapowane
  function komunikatHTML(typ, glowny, dodatek) {
    if (stolWlaczony) {
      zapiszKomunikat(tekstZHtml(glowny) + (dodatek ? " — " + tekstZHtml(dodatek) : ""));
      void stolOdswiez();
    }
    const k = KOLORY_CHIP[typ] || KOLORY_CHIP.pas;
    return '<div style="text-align:center; padding:8px; border:2px solid ' + k.ramka + '; background:' + k.tlo + '; border-radius:8px; color:' + k.tekst + ';">' +
      '<div style="font-size:18px; font-weight:bold; letter-spacing:1px;">' + glowny + '</div>' +
      (dodatek ? '<div style="font-size:12px; margin-top:2px;">' + dodatek + '</div>' : '') + '</div>';
  }

  // Naglowek na gorze okien dialogowych: czyja tura i kto nastepny
  function naglowekTuryHTML(g, rola, nastHTML) {
    return '<div style="text-align:center; padding:6px; margin-bottom:8px; border:1px solid #e5c158; border-radius:6px; background:rgba(229,193,88,0.12);">' +
      '<div style="font-size:11px; letter-spacing:2px; color:#c9bfae;">' + rola + '</div>' +
      '<div style="font-size:24px; font-weight:bold; color:#e5c158;">' + g.nH + '</div>' +
      (nastHTML ? '<div style="font-size:11px; opacity:0.85;">' + nastHTML + '</div>' : '') + '</div>';
  }

  // Ekran osłonowy (przekazanie ekranu): kosci i opcje gracza pojawiaja sie dopiero po jego potwierdzeniu.
  // Pomijany dla postaci, ktorymi steruje MG, oraz gdy osłona jest wylaczona w oknie startowym.
  async function ekranOslonowy(g, opis, wpisy) {
    if (!oslona || g.graMG || czyZdalnie(g)) return true;
    const wynik = await DialogV2.prompt({
      window: { title: "Przekaż ekran — " + g.nazwa },
      content: '<div style="text-align:center; padding:14px;">' +
        '<div style="font-size:12px; letter-spacing:2px; color:#c9bfae;">TERAZ TURA GRACZA</div>' +
        '<div style="font-size:34px; font-weight:bold; color:#e5c158; margin:6px 0;">' + g.nH + '</div>' +
        '<div style="font-size:14px; margin-bottom:10px;">' + opis + '</div>' +
        '<div style="font-size:13px; padding:8px; border:1px dashed #ef4444; border-radius:6px; color:#fecaca; margin-bottom:10px;">' +
        'Pozostali gracze: odwróćcie wzrok od ekranu. Kości i opcje zobaczy tylko ' + g.nH + ', po kliknięciu poniżej.</div>' +
        '<div>' + chipyHTML(wpisy, false) + '</div></div>',
      ok: {
        label: "Jestem tym graczem — pokaż moje kości",
        icon: "fa-solid fa-eye",
        callback: () => true
      },
      rejectClose: false
    });
    return wynik === true;
  }

  // Zamkniecie okna gracza krzyzykiem: MG wybiera - wrocic do okna, pominac gracza albo przerwac caly mecz.
  // Zamkniecie tego pytania = powrot do okna (bezpieczna odpowiedz domyslna).
  async function pytanieOZamknieciu(g, skutekPomijania) {
    if (g && g.pominiecieZGM) {
      g.pominiecieZGM = false;
      return "pomin";
    }
    const wynik = await DialogV2.wait({
      window: { title: "Okno zamknięte — " + g.nazwa },
      content: '<div style="text-align:center; padding:8px; font-size:13px;">' +
        '<p>Zamknięto okno gracza <strong>' + g.nH + '</strong>. Co robimy?</p>' +
        '<p style="font-size:12px; opacity:0.9;"><strong>Pomiń gracza:</strong> ' + skutekPomijania + '</p>' +
        '<p style="font-size:12px; opacity:0.9;"><strong>Przerwij mecz:</strong> wszystkie wpłacone stawki wracają do sakiewek.</p></div>',
      buttons: [
        { action: "wroc", label: "Wróć do okna", icon: "fa-solid fa-rotate-left", default: true },
        { action: "pomin", label: "Pomiń gracza", icon: "fa-solid fa-forward" },
        { action: "przerwij", label: "Przerwij mecz", icon: "fa-solid fa-ban" }
      ],
      rejectClose: false
    });
    return (wynik === "pomin" || wynik === "przerwij") ? wynik : "wroc";
  }

  async function ogloszPominiecie(g, glowny, dodatek) {
    await szeptDoMG("<strong>[Pominięcie tury]</strong> " + g.nH + ": " + dodatek);
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker(), content: komunikatHTML("now", glowny, dodatek) });
  }


  // ---- SAKIEWKA WFRP 4e ----
  function pobierzStanSakiewkiMP(actor) {
    return actor ? stanSakiewkiMP(actor) : null;
  }

  async function ustawSakiewkeMP(actor, noweMP) {
    const monety = monetyStandardowe(actor);
    const dostepne = [...new Set(monety.map(wartoscMonety))];
    if (dostepne.length === 0) {
      ui.notifications.warn(actor.name + " nie ma w ekwipunku żadnych monet (ZK/SS/MP) — dodaj je do karty postaci.");
      return;
    }
    const { mapa, reszta } = rozlozMonety(Math.max(0, noweMP), dostepne);
    if (reszta > 0) {
      ui.notifications.warn(actor.name + ": brak pozycji monet o niższym nominale, reszta " + reszta + " MP przepadła. Dodaj brakujące monety do ekwipunku.");
    }
    const pierwszeUzyte = new Set();
    for (const m of monety) {
      const val = wartoscMonety(m);
      const nowaIlosc = pierwszeUzyte.has(val) ? 0 : (mapa[val] ?? 0);
      pierwszeUzyte.add(val);
      if (typeof m.system.quantity === "object") {
        await m.update({ "system.quantity.value": nowaIlosc });
      } else {
        await m.update({ "system.quantity": nowaIlosc });
      }
    }
  }

  // Pobiera maksymalnie kwote, jaka postac faktycznie ma. Zwraca ile zaplacono.
  async function pobierzZSakiewki(actor, kwotaMP) {
    const stan = pobierzStanSakiewkiMP(actor);
    if (stan === null) return kwotaMP;
    const placi = Math.min(stan, kwotaMP);
    if (placi > 0) await ustawSakiewkeMP(actor, stan - placi);
    return placi;
  }

  async function wyplacNaSakiewke(actor, kwotaMP) {
    const stan = pobierzStanSakiewkiMP(actor);
    if (stan === null || kwotaMP <= 0) return;
    await ustawSakiewkeMP(actor, stan + kwotaMP);
  }

  // ---- ODCZYT POSTACI WFRP 4e ----
  // ---- KROK 1: LOBBY (stol karczemny, Drag & Drop) ----
  const miejsca = [];

  function znajdzUserIdDlaAktora(actor) {
    if (!actor) return null;
    const wlasciciel = game.users.find((u) => !u.isGM && u.character?.id === actor.id)
      || game.users.find((u) => !u.isGM && u.active && actor.testUserPermission(u, "OWNER"));
    return wlasciciel ? wlasciciel.id : null;
  }

  function odczytajUpuszczone(event) {
    try {
      return JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch (err) {
      return null;
    }
  }

  function dodajMiejsce(wpis) {
    if (miejsca.length >= MAX_MIEJSC) {
      ui.notifications.warn("Przy stole jest tylko " + MAX_MIEJSC + " miejsc.");
      return false;
    }
    if (wpis.actor && miejsca.some((m) => m.actor && m.actor.uuid === wpis.actor.uuid)) {
      ui.notifications.warn(wpis.nazwa + " już siedzi przy stole.");
      return false;
    }
    miejsca.push(wpis);
    return true;
  }

  function wpisZAktora(actor, nazwa, opis) {
    const uid = znajdzUserIdDlaAktora(actor);
    const wlasciciel = uid ? game.users.get(uid) : null;
    return {
      nazwa: nazwa || actor.name,
      actor: actor,
      userId: uid,
      // graMG: true = postacią steruje MG (ręka i rzuty widzi tylko MG); domyślnie gdy właściciela nie ma online
      graMG: !(wlasciciel && wlasciciel.active),
      opis: opis,
      img: actor.img
    };
  }

  const lobbyHTML = '<div style="padding:6px 4px; font-size:13px;">' +
    '<h3 style="margin:0 0 6px 0; border-bottom:1px solid #8c6d46; color:#e5c158;">1. Format meczu</h3>' +
    '<div style="margin-bottom:10px; background:rgba(0,0,0,0.25); padding:6px 8px; border-radius:6px;">' +
    '<label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-bottom:4px;"><input type="radio" name="match_mode" value="2" checked /><span><strong>Oryginalny (do 2 wygranych rund / Best of 3)</strong></span></label>' +
    '<label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="radio" name="match_mode" value="1" /><span>Szybka partia (1 runda)</span></label>' +
    '<label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-top:4px;"><input type="radio" name="match_mode" value="R" /><span>Rundy z wypłatą po każdej (wpisowe co rundę, kolejna runda na życzenie)</span></label>' +
    '</div>' +
    '<h3 style="margin:0 0 6px 0; border-bottom:1px solid #8c6d46; color:#e5c158;">2. Stół karczemny</h3>' +
    '<p style="margin:0 0 6px 0; font-size:11px; opacity:0.8;">Przeciągnij postać z zakładki Actors na stół (lub upuść token, jeśli Twoja konfiguracja to umożliwia). Możesz też wczytać zaznaczone tokeny ze sceny.</p>' +
    '<div id="poker-stol" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; background:rgba(60,35,15,0.55); border:2px dashed #8c6d46; border-radius:8px; padding:8px; margin-bottom:8px; min-height:120px;"></div>' +
    '<div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;">' +
    '<button type="button" data-lobby="tokeny" style="flex:1; font-size:11px; cursor:pointer;"><i class="fa-solid fa-user-plus"></i> Wczytaj zaznaczone tokeny</button>' +
    '<button type="button" data-lobby="gracze" style="flex:1; font-size:11px; cursor:pointer;"><i class="fa-solid fa-users"></i> Dodaj aktywnych graczy</button>' +
    '<button type="button" data-lobby="wyczysc" style="flex:1; font-size:11px; cursor:pointer;"><i class="fa-solid fa-broom"></i> Opróżnij stół</button>' +
    '</div>' +
    '<div style="display:flex; gap:6px; margin-bottom:10px;">' +
    '<input type="text" name="extra_npc" placeholder="Dopisz BN-a ręcznie, np. Jednooki Hans" style="flex:1;" />' +
    '<button type="button" data-lobby="bn" style="font-size:11px; cursor:pointer;"><i class="fa-solid fa-plus"></i> Dodaj BN</button>' +
    '</div>' +
    '<div style="margin-bottom:10px; background:rgba(0,0,0,0.25); padding:6px 8px; border-radius:6px;">' +
    '<label style="font-size:12px;">Kości do gry:<select name="dice_mode" style="width:100%; margin-top:4px;">' +
    '<option value="karczma">Kości zapewnia karczma (bez wymagań)</option>' +
    '<option value="wymagany">Ktoś przy stole musi mieć zestaw do gry w kości</option>' +
    '<option value="kara">Brak własnego zestawu: kara −10 do Hazardu</option>' +
    '</select></label>' +
    '<label style="font-size:12px; display:block; margin-top:6px;">Warunki przy stole:<select name="warunki" style="width:100%; margin-top:4px;">' +
    '<option value="normalne">Zwykła karczma</option>' +
    '<option value="gwar">Tłok, gwar lub słabe światło (+10 dla oszusta)</option>' +
    '<option value="cisza">Cisza, dobre światło lub wysoka stawka (−10 dla oszusta)</option>' +
    '</select></label></div>' +
    '<h3 style="margin:0 0 6px 0; border-bottom:1px solid #8c6d46; color:#e5c158;">3. Wpisowe do puli (od osoby)</h3>' +
    '<div style="display:flex; gap:8px; align-items:center; justify-content:space-between; margin-bottom:8px;">' +
    '<label style="flex:1; text-align:center;"><span style="color:#ffd700; font-weight:bold;">Złote Korony (ZK)</span><input type="number" name="bet_zk" value="0" min="0" style="width:100%; text-align:center; margin-top:4px;" /></label>' +
    '<label style="flex:1; text-align:center;"><span style="color:#d8d8d8; font-weight:bold;">Srebrne Szylingi (SS)</span><input type="number" name="bet_ss" value="5" min="0" style="width:100%; text-align:center; margin-top:4px;" /></label>' +
    '<label style="flex:1; text-align:center;"><span style="color:#cd7f32; font-weight:bold;">Miedziane Pensy (MP)</span><input type="number" name="bet_mp" value="0" min="0" style="width:100%; text-align:center; margin-top:4px;" /></label>' +
    '</div>' +
    '<label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12px;"><input type="checkbox" name="auto_coins" checked /><span>Automatycznie pobierz wpisowe i wypłać wygraną z kart postaci WFRP4e</span></label>' +
    '<label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12px; margin-top:6px;"><input type="checkbox" name="oslona" checked /><span>Ekran osłonowy: przed ukrytymi ruchami gracza pojawia się ekran „przekaż ekran”, żeby inni nie widzieli jego kości i opcji</span></label>' +
    '<label style="display:flex; align-items:center; gap:8px; font-size:12px; margin-top:6px;"><span>Czas wyświetlania dużych banerów w sekundach (0 = do kliknięcia):</span><input type="number" name="czas_banerow" value="4" min="0" max="30" step="1" style="width:60px; text-align:center;" /></label>' +
    '<label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12px; margin-top:6px;"><input type="checkbox" name="zdalne" checked /><span>Okna graczy otwierają się na ich komputerach (gracze z włączonym modułem i aktywni w grze)</span></label>' +
    '<label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12px; margin-top:6px;"><input type="checkbox" name="bn_auto" checked /><span>BN przy stole (bez gracza) grają automatycznie: sami wymieniają kości, podbijają i dopłacają (uczciwie, bez oszustw)</span></label>' +
    '<label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12px; margin-top:6px;"><input type="checkbox" name="stol" checked /><span>Stół do gry otwarty na ekranach MG i graczy przez cały mecz (miejsca, kości, pula, animacje rzutów)</span></label>' +
    '<label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12px; margin-top:6px;"><input type="checkbox" name="dsn" checked /><span>Kości 3D (Dice So Nice) obok animacji na stole</span></label>' +
    '<label style="display:flex; align-items:center; gap:8px; font-size:12px; margin-top:6px;"><span>Szósty Zmysł (Czytaj z twarzy):</span><select name="sz_zmysl" style="flex:1;"><option value="plus10" selected>+10 do testu za poziom talentu</option><option value="ps">+1 PS za poziom przy udanym teście (wg zasady talentów)</option></select></label>' +
    '</div>';

  function zbudujLobbyRender(event, dialog) {
    const el = dialog.element;
    const stol = el.querySelector("#poker-stol");

    const odswiez = () => {
      stol.replaceChildren();
      for (let i = 0; i < MAX_MIEJSC; i++) {
        const m = miejsca.at(i);
        const slot = document.createElement("div");
        slot.style.cssText = "display:flex; align-items:center; gap:6px; min-height:52px; padding:4px; border-radius:6px; font-size:11px; background:rgba(0,0,0,0.3); border:1px solid #5c4632;";
        if (m) {
          const img = document.createElement("img");
          img.src = m.img || "icons/svg/mystery-man.svg";
          img.style.cssText = "width:42px; height:42px; object-fit:cover; border:1px solid #8c6d46; border-radius:4px; flex:none;";
          const info = document.createElement("div");
          info.style.cssText = "flex:1; min-width:0; line-height:1.25;";
          const nazwa = document.createElement("strong");
          nazwa.textContent = m.nazwa;
          nazwa.style.cssText = "display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
          const szczegoly = document.createElement("span");
          szczegoly.style.cssText = "opacity:0.85;";
          if (m.actor) {
            const st = analizujPostacWFRP(m.actor);
            const sak = pobierzStanSakiewkiMP(m.actor);
            szczegoly.textContent = "Sakiewka: " + formatujWaluteWFRP(sak ?? 0) + " | Hazard " + st.hazardWartosc + "%" +
              (st.szulerPoziom ? " | Szuler " + st.szulerPoziom : "") + (st.szczescieMax ? " | Szczęście " + st.szczescieMax : "") + (st.maZestawKosci ? " | Zestaw kości" : "");
          } else {
            szczegoly.textContent = m.opis;
          }
          info.appendChild(nazwa);
          info.appendChild(szczegoly);
          if (m.userId) {
            const wlasciciel = game.users.get(m.userId);
            const sterowanie = document.createElement("button");
            sterowanie.type = "button";
            sterowanie.textContent = m.graMG ? "Gra: MG" : "Gra: " + (wlasciciel ? wlasciciel.name : "gracz");
            sterowanie.title = "Kliknij, aby przełączyć: kto steruje tą postacią (ręka i rzuty ukryte przed pozostałymi)";
            sterowanie.style.cssText = "font-size:10px; padding:1px 4px; margin-top:2px; cursor:pointer;";
            sterowanie.addEventListener("click", () => {
              m.graMG = !m.graMG;
              odswiez();
            });
            info.appendChild(sterowanie);
          }
          const usun = document.createElement("button");
          usun.type = "button";
          usun.textContent = "×";
          usun.title = "Zabierz z miejsca";
          usun.style.cssText = "flex:none; width:22px; height:22px; line-height:1; padding:0; cursor:pointer;";
          usun.addEventListener("click", () => {
            miejsca.splice(i, 1);
            odswiez();
          });
          slot.appendChild(img);
          slot.appendChild(info);
          slot.appendChild(usun);
        } else {
          slot.style.justifyContent = "center";
          slot.style.opacity = "0.55";
          slot.style.borderStyle = "dashed";
          slot.textContent = "Wolne miejsce " + (i + 1);
        }
        stol.appendChild(slot);
      }
    };

    stol.addEventListener("dragover", (e) => {
      e.preventDefault();
      stol.style.borderColor = "#e5c158";
    });
    stol.addEventListener("dragleave", () => {
      stol.style.borderColor = "#8c6d46";
    });
    stol.addEventListener("drop", async (e) => {
      e.preventDefault();
      stol.style.borderColor = "#8c6d46";
      const dane = odczytajUpuszczone(e);
      if (!dane || !dane.uuid) {
        ui.notifications.warn("Upuszczono coś, co nie jest postacią ani tokenem.");
        return;
      }
      const doc = await fromUuid(dane.uuid);
      let actor = null;
      let nazwa = null;
      if (doc?.documentName === "Actor") {
        actor = doc;
      } else if (doc?.documentName === "Token") {
        actor = doc.actor;
        nazwa = doc.name;
      }
      if (!actor) {
        ui.notifications.warn("Nie udało się odczytać postaci z upuszczonego elementu.");
        return;
      }
      if (dodajMiejsce(wpisZAktora(actor, nazwa, "Postać"))) odswiez();
    });

    el.querySelectorAll("button[data-lobby]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const akcja = btn.getAttribute("data-lobby");
        if (akcja === "tokeny") {
          for (const token of canvas.tokens.controlled) {
            if (token.actor) dodajMiejsce(wpisZAktora(token.actor, token.name, "Token na scenie"));
          }
        } else if (akcja === "gracze") {
          for (const user of game.users.filter((u) => u.active && !u.isGM)) {
            if (user.character) {
              dodajMiejsce({ nazwa: user.character.name, actor: user.character, userId: user.id, graMG: false, opis: "Gracz (" + user.name + ")", img: user.character.img });
            } else {
              dodajMiejsce({ nazwa: user.name, actor: null, userId: user.id, graMG: false, opis: "Gracz bez postaci", img: null });
            }
          }
        } else if (akcja === "wyczysc") {
          miejsca.length = 0;
        } else if (akcja === "bn") {
          const pole = el.querySelector("input[name='extra_npc']");
          const tekst = pole.value.trim();
          if (tekst && dodajMiejsce({ nazwa: tekst, actor: null, userId: null, opis: "BN (bez karty postaci)", img: null })) {
            pole.value = "";
          }
        }
        odswiez();
      });
    });

    odswiez();
  }

  let ustawienia = null;
  while (!ustawienia) {
    const wynik = await DialogV2.prompt({
      window: { title: "Kościany Poker — Pełny Pakiet WFRP 4e" },
      position: { width: 560 },
      content: lobbyHTML,
      render: zbudujLobbyRender,
      ok: {
        label: "Rozpocznij mecz",
        icon: "fa-solid fa-dice",
        callback: (event, button) => {
          const form = button.form;
          const ekstra = form.elements.namedItem("extra_npc")?.value.trim();
          if (ekstra) dodajMiejsce({ nazwa: ekstra, actor: null, userId: null, opis: "BN (bez karty postaci)", img: null });

          const zk = Math.max(0, Number(form.elements.namedItem("bet_zk")?.value) || 0);
          const ss = Math.max(0, Number(form.elements.namedItem("bet_ss")?.value) || 0);
          const mp = Math.max(0, Number(form.elements.namedItem("bet_mp")?.value) || 0);
          const stawka = (zk * 240) + (ss * 12) + mp;
          const trybKosci = form.elements.namedItem("dice_mode")?.value || "karczma";
          const formatMeczu = form.elements.namedItem("match_mode")?.value || "2";
          const warunki = form.elements.namedItem("warunki")?.value || "normalne";
          return {
            zaMalo: miejsca.length < 2,
            stawkaMP: stawka,
            trybR: formatMeczu === "R",
            wymaganeWygrane: formatMeczu === "R" ? 1 : (Number(formatMeczu) || 2),
            autoMonety: Boolean(form.elements.namedItem("auto_coins")?.checked),
            oslona: Boolean(form.elements.namedItem("oslona")?.checked),
            zdalne: Boolean(form.elements.namedItem("zdalne")?.checked),
            bnAuto: Boolean(form.elements.namedItem("bn_auto")?.checked),
            szostyZmysl: form.elements.namedItem("sz_zmysl")?.value === "ps" ? "ps" : "plus10",
            stol: Boolean(form.elements.namedItem("stol")?.checked),
            dsn: Boolean(form.elements.namedItem("dsn")?.checked),
            czasBaneru: (() => {
              const t = form.elements.namedItem("czas_banerow")?.value;
              return (t === undefined || t === null || String(t).trim() === "") ? 4 : Math.min(30, Math.max(0, Number(t) || 0));
            })(),
            kosciTryb: trybKosci,
            warunkiMod: warunki === "gwar" ? 10 : (warunki === "cisza" ? -10 : 0),
            brakZestawu: (trybKosci === "wymagany" || (trybKosci === "karczma" && stawka >= 240)) &&
              !miejsca.some((m) => m.actor && analizujPostacWFRP(m.actor).maZestawKosci)
          };
        }
      },
      rejectClose: false
    });

    if (!wynik) return;
    if (wynik.zaMalo) {
      ui.notifications.warn("Do stołu potrzeba co najmniej 2 graczy.");
      continue;
    }
    if (wynik.brakZestawu) {
      ui.notifications.warn("Przy tej grze ktoś przy stole musi mieć zestaw do gry w kości (tryb „wymagany” albo stawka od 1 ZK). Dodaj gospodarza z zestawem albo zmień ustawienia.");
      continue;
    }
    ustawienia = wynik;
  }

  const { stawkaMP, wymaganeWygrane, autoMonety, kosciTryb, trybR, warunkiMod, oslona, czasBaneru, zdalne, bnAuto, stol: stolOpcja, dsn: dsnOpcja, szostyZmysl: szostyZmyslTryb } = ustawienia;
  zdalneWlaczone = Boolean(zdalne);
  stolWlaczony = Boolean(stolOpcja);
  dsnWlaczone = Boolean(dsnOpcja);
  function statyDlaStolu(actor) {
    const st = analizujPostacWFRP(actor);
    if (kosciTryb === "kara" && st.maAktora && !st.maZestawKosci) {
      st.hazardWartosc = Math.max(0, st.hazardWartosc - 10);
      st.karaZestaw = true;
    }
    return st;
  }
  const gracze = miejsca.map((m) => ({
    nazwa: m.nazwa,
    nH: esc(m.nazwa),
    actor: m.actor,
    token: obrazTokena(m.actor),
    userId: m.graMG ? null : m.userId,
    graMG: Boolean(m.graMG) || !m.userId,
    wygraneRundy: 0,
    szczescieUzyte: 0,
    czytaniaUzyte: 0, // Czytaj z twarzy: raz na gre
    wyrzucony: false,
    wplacono: 0,
    allIn: false, // wszedl all-in w tej rundzie (znacznik na stole)
    podbil: false, // podbil stawke w tej rundzie (zeton na stole)
    probyOszustw: 0,
    kosciObciazone: null,
    auto: Boolean(bnAuto) && !m.userId, // BN grany przez automat
    przejeta: Boolean(m.graMG && m.userId),
    statystyki: statyDlaStolu(m.actor)
  }));

  let calaPulaMP = 0;
  aktywnaGra = { odswiez: odswiezKlientaWewn };

  async function wplacDoPuli(g, kwotaMP) {
    let zaplacono = kwotaMP;
    if (autoMonety && g.actor) {
      zaplacono = await pobierzZSakiewki(g.actor, kwotaMP);
      if (zaplacono < kwotaMP) {
        ui.notifications.warn(g.nazwa + ": w sakiewce odczytano " + formatujWaluteWFRP(zaplacono) + ", a potrzeba " + formatujWaluteWFRP(kwotaMP) + " — pobrano tylko tyle, ile jest.");
      }
    }
    g.wplacono += zaplacono;
    calaPulaMP += zaplacono;
    return zaplacono;
  }

  // Przerwanie meczu (zamkniecie okna): zwrot wpisowego i podbic
  async function przerwijMecz() {
    if (autoMonety) {
      for (const g of gracze) {
        if (g.actor && g.wplacono > 0) await wyplacNaSakiewke(g.actor, g.wplacono);
        g.wplacono = 0;
      }
    }
    calaPulaMP = 0;
    await oznaczMigawke("przerwany");
    if (stolWlaczony) {
      stolKoniec = true;
      stolFn = null;
      stolSrodek = { etykieta: "KOŚCIANY POKER", rola: "MECZ PRZERWANY", imie: "Koniec gry", nastepnyHTML: "" };
      zapiszKomunikat("Wpłacone stawki wróciły do sakiewek.");
      await stolOdswiez();
    }
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker(),
      content: '<div style="text-align:center; font-size:12px; color:#fca5a5;"><em>Mecz Kościanego Pokera został przerwany. Wpłacone stawki wróciły do sakiewek.</em></div>'
    });
  }

  let pulaWyplacona = false;
  let resztaPrzeniesiona = 0; // niepodzielna reszta z puli (tryb rund), dopisywana przy kolejnej wyplacie
  try {
  await zapiszMigawke(gracze, "w_toku");
  if (stawkaMP > 0 && !trybR) {
    for (const g of gracze) {
      await wplacDoPuli(g, stawkaMP);
    }
  }

  let raportMG = "<strong>[Kościany Poker — Start Meczu]</strong><br/>";
  for (const g of gracze) {
    const s = g.statystyki;
    raportMG += "• <strong>" + g.nH + "</strong> [" + (g.auto ? "BN — automat" : (g.graMG ? "gra MG" : "gra gracz")) + "]: Hazard " + s.hazardWartosc + "%, Zwinne Palce " + (s.maZwinnePalce ? s.zwinnePalceWartosc + "%" : "brak umiejętności (Zręczność " + s.zwinnePalceWartosc + "%)") + ", Szczęście: " + s.szczescieMax + ", Szuler Kościany: " + s.szulerPoziom + "<br/>" +
      "&nbsp;&nbsp;Sakiewka po wpisowym: " + formatujWaluteWFRP(pobierzStanSakiewkiMP(g.actor) ?? 0) + " [" + opisSakiewki(g.actor) + "]<br/>" +
      "&nbsp;&nbsp;Kości: zestaw " + (s.maZestawKosci ? "tak" : "nie") + (s.karaZestaw ? " (kara −10 do Hazardu)" : "") + ", obciążone: " + (s.maObciazoneKosci ? "<strong>TAK</strong>" : "nie") + "<br/>";
  }
  raportMG += "Warunki przy stole: " + (warunkiMod > 0 ? "+10 dla oszusta (gwar / słabe światło)" : (warunkiMod < 0 ? "−10 dla oszusta (cisza / wysoka stawka)" : "zwykłe")) + ". Tryb: " + (trybR ? "rundy z wypłatą po każdej" : "do " + wymaganeWygrane + " wygranych rund") + ". Ekran osłonowy: " + (oslona ? "włączony" : "wyłączony") + ". Stół do gry: " + (stolWlaczony ? "włączony" : "wyłączony") + ". Kości 3D: " + (dsnWlaczone ? "tak" : "nie") + ". Czas banerów: " + (czasBaneru > 0 ? czasBaneru + " s (kliknięcie pomija)" : "do kliknięcia") + ". Okna graczy: " + (zdalneWlaczone ? "na ich komputerach (gdy są online)" : "na ekranie MG") + ".<br/>";
  await szeptDoMG(raportMG);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    content: '<div style="background:rgba(25, 20, 15, 0.92); border:1px solid #8c6d46; border-radius:8px; padding:10px; color:#f0e6d2; text-align:center;">' +
      '<h3 style="margin:0 0 6px 0; color:#e5c158; border-bottom:1px solid #8c6d46; padding-bottom:4px;">Rozpoczyna się mecz Kościanego Pokera!</h3>' +
      '<p style="margin:4px 0; font-size:12px;"><strong>Zasady:</strong> Do ' + wymaganeWygrane + ' wygranych rund | <strong>Gracze:</strong> ' + gracze.map((g) => g.nH).join(", ") + '</p>' +
      '<p style="margin:4px 0; font-size:13px; color:#ffd700;">Wpisowe: <strong>' + formatujWaluteWFRP(stawkaMP) + '</strong> | Pula na stole: <strong>' + formatujWaluteWFRP(calaPulaMP) + '</strong></p>' +
      '</div>'
  });

  // Wyplata puli: jeden zwyciezca (z limitem all-in i zwrotem nadwyzek) albo podzial przy remisie
  // Wyplata puli z pulami bocznymi. tieryGraczy: [[gracze na 1. miejscu], [na 2. miejscu], ...] (tylko uprawnieni)
  async function wyplacPule(tieryGraczy) {
    const wklady = {};
    gracze.forEach((g, i) => { wklady[String(i)] = g.wplacono; });
    const tiery = tieryGraczy.map((t) => t.map((g) => String(gracze.indexOf(g))));
    const suma = Object.values(wklady).reduce((acc, v) => acc + v, 0);
    const { wyplaty, reszta } = podzielPule(wklady, tiery);
    for (const g of gracze) g.wplacono = 0; // najpierw zerujemy, zeby awaria nie spowodowala podwojnego zwrotu
    const bonus = resztaPrzeniesiona;
    resztaPrzeniesiona = reszta;
    calaPulaMP = reszta;
    if (bonus > 0 && tiery.length > 0 && tiery.at(0).length > 0) {
      const k0 = tiery.at(0).at(0);
      wyplaty[k0] = (wyplaty[k0] || 0) + bonus;
    }
    const wpisy = [];
    for (const k of Object.keys(wyplaty)) {
      const g = gracze.at(Number(k));
      if (autoMonety && g.actor) await wyplacNaSakiewke(g.actor, wyplaty[k]);
      wpisy.push({ g: g, kwota: wyplaty[k], zwyciezca: tiery.length > 0 && tiery.at(0).includes(k) });
    }
    return { wpisy: wpisy, suma: suma, reszta: reszta };
  }

  // Przejecie postaci gracza przez MG jest jawnie logowane
  const przejete = gracze.filter((g) => g.przejeta).map((g) => g.nH);
  if (przejete.length > 0) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker(),
      content: '<div style="text-align:center; font-size:12px; color:#c4b5fd;"><em>Mistrz Gry steruje postaciami: ' + przejete.join(", ") + '.</em></div>'
    });
  }

  // ---- GLOWNA PETLA MECZU ----
  let numerRundy = 1;
  let zwyciezcaMeczu = null;

  while (!zwyciezcaMeczu) {
    const aktywniWRundzie = gracze.filter((g) => !g.wyrzucony);
    if (aktywniWRundzie.length <= 1) {
      zwyciezcaMeczu = aktywniWRundzie.at(0) || gracze.at(0);
      break;
    }

    // Tryb rund: wpisowe pobierane na poczatku kazdej rundy
    if (trybR && stawkaMP > 0) {
      for (const g of aktywniWRundzie) {
        await wplacDoPuli(g, stawkaMP);
      }
    }

    await ogloszRunde(numerRundy, calaPulaMP, aktywniWRundzie);

    let podbiciaWRundzie = 0; // maks. 3 podbicia na runde

    // Faza 1: pierwszy rzut kazdego gracza - JAWNY (kolejka + animacja kubka + 5d6 widoczne dla wszystkich)
    const stanyRundy = [];
    for (let nr = 0; nr < aktywniWRundzie.length; nr++) {
      const gracz = aktywniWRundzie.at(nr);
      const wpisyF1 = wpisyFaza1(aktywniWRundzie, nr);
      const nastF1 = aktywniWRundzie.at(nr + 1);
      const nastF1Html = nastepnyHTML(nastF1 && nastF1.nazwa, "Po nim: wymiana kości");
      await ogloszTure({
        etykieta: "RUNDA " + numerRundy + " · FAZA 1 z 3 — PIERWSZY RZUT (JAWNY)",
        rola: "RZUCA",
        imie: gracz.nazwa,
        nastepnyHTML: nastF1Html,
        wpisy: wpisyF1,
        gracze: aktywniWRundzie,
        wpisyFn: () => wpisyFaza1(aktywniWRundzie, nr)
      });

      const konfRzutu = {
        dla: gracz,
        window: { title: "Runda " + numerRundy + " — Kolej gracza: " + gracz.nazwa },
        content: '<div style="text-align:center; padding:6px;">' +
          naglowekTuryHTML(gracz, "RUNDA " + numerRundy + " · RZUCA", nastF1Html) +
          '<div>' + chipyHTML(wpisyF1, false) + '</div>' +
          '<div style="font-size:38px; color:#d4af37; margin:8px 0;"><i class="fa-solid fa-dice"></i></div>' +
          '<p style="font-size:12px; opacity:0.85;">Kliknij poniżej, aby potrząsnąć skórzanym kubkiem i wysypać kości na stół.</p>' +
          '</div>',
        ok: {
          label: "Potrząśnij kubkiem i rzuć!",
          icon: "fa-solid fa-dice",
          callback: () => true
        },
        rejectClose: false
      };
      let potwRzut = Boolean(gracz.auto);
      while (!potwRzut) {
        potwRzut = (await DialogV2.prompt(konfRzutu)) === true;
        if (potwRzut) break;
        const dec = await pytanieOZamknieciu(gracz, "makro samo rzuci kośćmi za gracza (rzut jest losowy, więc nikt nie traci wyboru).");
        if (dec === "przerwij") return await przerwijMecz();
        if (dec === "pomin") {
          await ogloszPominiecie(gracz, gracz.nH + " — RZUT ZA GRACZA", "Mistrz Gry rzuca kośćmi za gracza, który nie reagował.");
          potwRzut = true;
        }
      }

      await animujKubek(gracz.nazwa, "Runda " + numerRundy + " — Pierwszy rzut");

      const rzut1 = await rzucK6(5, gracz);
      const kosci = rzut1.terms.at(0).results.map((r) => r.result);
      const uklad1 = ocenUklad(kosci);
      stolRzutJawny(gracz, kosci, uklad1);
      await pokazKosci3D(rzut1, gracz, 1500, true);
      await publicznaReka(gracz, kosci, "pierwszy rzut: <strong>" + uklad1.nazwa + "</strong>");
      stanyRundy.push({
        graczObj: gracz,
        kosci: kosci,
        uklad: uklad1,
        rangaPierwsza: uklad1.ranga,
        wymienil: 0,
        szczescieRunda: 0, // uzycia Szczescia w tej rundzie
        podbilWRundzie: false,
        obciazoneProba: false,
        uzylPodmiany: false,
        skonczyl: false,
        spasowal: false,
        zdyskwalifikowany: false
      });
    }

    // Faza 2: WYMIANA KOSCI (ukryta); Przewaga Hazardu daje darmowy przerzut 1 kosci
    for (let nr2 = 0; nr2 < stanyRundy.length; nr2++) {
      const stan = stanyRundy.at(nr2);
      const g = stan.graczObj;
      const wpisyF2 = wpisyFaza2(stanyRundy, nr2);
      const nastF2 = stanyRundy.at(nr2 + 1);
      const nastF2Html = nastepnyHTML(nastF2 && nastF2.graczObj.nazwa, "Po nim: akcje przy stole");
      await ogloszTure({
        etykieta: "RUNDA " + numerRundy + " · FAZA 2 z 3 — WYMIANA KOŚCI (UKRYTA)",
        rola: "WYMIENIA",
        imie: g.nazwa,
        nastepnyHTML: nastF2Html,
        wpisy: wpisyF2,
        gracze: stanyRundy.map((st2) => st2.graczObj),
        wpisyFn: () => wpisyFaza2(stanyRundy, nr2)
      });
      let wybor = g.auto ? wymianaAutomatu(stan.kosci) : null;
      while (wybor === null) {
        if (await ekranOslonowy(g, "Wymiana kości — wynik zobaczysz tylko Ty (i MG)", wpisyF2)) {
          wybor = await okienkoWymiany(g, stan, numerRundy,
            naglowekTuryHTML(g, "RUNDA " + numerRundy + " · WYMIANA KOŚCI", nastF2Html) + '<div style="margin-bottom:6px;">' + chipyHTML(wpisyF2, false) + '</div>');
          if (wybor !== null) break;
        }
        const dec = await pytanieOZamknieciu(g, "gracz zostaje przy swoich kościach (bez wymiany).");
        if (dec === "przerwij") return await przerwijMecz();
        if (dec === "pomin") {
          await ogloszPominiecie(g, g.nH + " — WYMIANA POMINIĘTA", "Mistrz Gry pomija wymianę gracza. Zostaje przy swoich kościach.");
          wybor = [];
        }
      }

      ustawKomunikat(g.nazwa + (wybor.length > 0 ? " wymienia " + wybor.length + (wybor.length === 1 ? " kość" : " kości") : " zostaje przy swoich kościach") + ".");
      await ChatMessage.create({
        speaker: { alias: g.nazwa },
        content: '<div style="text-align:center; font-size:12px; color:#e5c158;"><em>' + g.nH +
          (wybor.length > 0 ? " wymienia " + wybor.length + (wybor.length === 1 ? " kość" : " kości") : " zostaje przy swoich kościach") + '.</em></div>'
      });

      if (wybor.length > 0) {
        await animujKubek(g.nazwa, "Runda " + numerRundy + " — Wymiana (" + wybor.length + ")");
        // Szuler Kościany: dodatkowe k6 za każdy poziom talentu, do ręki trafiają najlepsze wyniki
        const dodatkowe = g.statystyki.szulerPoziom;
        const rzut2 = await rzucK6(wybor.length + dodatkowe, g);
        stolAnimujUkryte(g, stan.kosci, wybor);
        await pokazKosci3D(rzut2, g, 1500);
        let noweWyniki = rzut2.terms.at(0).results.map((r) => r.result);
        if (dodatkowe > 0) {
          const zachowane = stan.kosci.filter((_, i) => !wybor.includes(i));
          const wybraneIdx = await wyborZPuli(g, zachowane, noweWyniki, wybor.length);
          const wybrane = wybraneIdx.map((i) => noweWyniki.at(i));
          const opt = najlepszeZPuli(zachowane, noweWyniki, wybor.length);
          await szeptDoMG("<strong>[Szuler Kościany — wymiana]</strong> " + g.nH + " rzucił " + noweWyniki.length + " kości (" + noweWyniki.join(", ") + "), do ręki wybrał: " + wybrane.join(", ") + (ocenUklad(zachowane.concat(wybrane)).ranga < opt.uklad.ranga ? " (nie jest to najlepszy możliwy wybór)" : "") + ".");
          await szeptDoGraczaIMG(g.userId, "<strong>[Szuler Kościany]</strong> Rzuciłeś " + noweWyniki.length + " kości: " + noweWyniki.join(", ") + ". Do ręki wybrałeś: <strong>" + wybrane.join(", ") + "</strong>.");
          noweWyniki = wybrane;
        }
        wybor.forEach((indeksKosci, i) => {
          stan.kosci.splice(indeksKosci, 1, noweWyniki.at(i));
        });
        stan.uklad = ocenUklad(stan.kosci);
      }
      stan.wymienil = wybor.length;
      await szeptReke(g, stan.kosci, "po wymianie: <strong>" + stan.uklad.nazwa + "</strong>");

      if (maPrzewageHazardu(stan, stanyRundy)) {
        const ekstra = await DialogV2.prompt({
          dla: g,
          autoOdp: () => ekstraAutomatu(stan.kosci),
          window: { title: "Przewaga Hazardu — darmowy przerzut" },
          content: '<div style="padding:8px; text-align:center;">' +
            '<p style="color:#e5c158; font-weight:bold;">Jesteś najlepszym hazardzistą przy tym stole!</p>' +
            '<p>Twoja ręka to <strong>' + stan.uklad.nazwa + '</strong>. Możesz za darmo przerzucić 1 kość:</p>' +
            '<select name="adv_die" style="width:80%; margin-top:8px;">' +
            '<option value="-1">Nie przerzucam</option>' +
            stan.kosci.map((k, idx) => '<option value="' + idx + '">Przerzuć kość #' + (idx + 1) + ' (obecnie: ' + k + ')</option>').join("") +
            '</select></div>',
          ok: {
            label: "Zatwierdź",
            icon: "fa-solid fa-crown",
            callback: (event, button) => Number(button.form.elements.namedItem("adv_die")?.value)
          },
          rejectClose: false
        });
        const uzyto = ekstra !== null && ekstra >= 0;
        await szeptDoMG("<strong>[Przewaga Hazardu]</strong> " + g.nH + " ma przewagę nad całym stołem (Hazard " + g.statystyki.hazardWartosc + ")" +
          (uzyto ? ": darmowy przerzut kości #" + (ekstra + 1) + "." : ": rezygnuje z przerzutu."));
        if (uzyto) await przerzutUkryty(g, stan, ekstra, "Przewaga Hazardu — darmowy przerzut");
      }
    }

    // Faza 3: AKCJE PRZY STOLE - gracz zna swoja reke (podbicie, pas, oszustwo, czytanie, talenty)
    for (let nr3 = 0; nr3 < stanyRundy.length; nr3++) {
      const stan = stanyRundy.at(nr3);
      if (stan.spasowal || stan.zdyskwalifikowany) continue;
      const g = stan.graczObj;
      const s = g.statystyki;
      const nastF3 = stanyRundy.slice(nr3 + 1).find((r) => !r.spasowal && !r.zdyskwalifikowany);
      const nastF3Html = nastepnyHTML(nastF3 && nastF3.graczObj.nazwa, "Po nim: rozstrzygnięcie rundy");
      await ogloszTure({
        etykieta: "RUNDA " + numerRundy + " · FAZA 3 z 3 — AKCJE PRZY STOLE",
        rola: "DECYDUJE",
        imie: g.nazwa,
        nastepnyHTML: nastF3Html,
        wpisy: wpisyFaza3(stanyRundy, stan),
        gracze: stanyRundy.map((st2) => st2.graczObj),
        wpisyFn: () => wpisyFaza3(stanyRundy, stan)
      });
      let odslonieto = await ekranOslonowy(g, "Akcje przy stole — Twoja ręka i opcje zobaczysz tylko Ty (i MG)", wpisyFaza3(stanyRundy, stan));
      while (!odslonieto) {
        const dec = await pytanieOZamknieciu(g, "gracz nie wykonuje żadnych akcji w tej turze.");
        if (dec === "przerwij") return await przerwijMecz();
        if (dec === "pomin") break;
        odslonieto = await ekranOslonowy(g, "Akcje przy stole — Twoja ręka i opcje zobaczysz tylko Ty (i MG)", wpisyFaza3(stanyRundy, stan));
      }
      if (!odslonieto) {
        await ogloszPominiecie(g, g.nH + " — TURA POMINIĘTA", "Mistrz Gry pomija turę gracza bez akcji.");
        stan.skonczyl = true;
        continue;
      }

      // Oszustwo wymaga umiejetnosci zaawansowanej Zwinne Palce (talenty Szuler i Szybkie Rece tylko ja wspieraja)
      // Oszustwo: umiejetnosc Zwinne Palce albo talent Szuler (bez umiejetnosci test idzie na Zrecznosci)
      const maOszustwo = s.maAktora && (s.maZwinnePalce || s.szulerPoziom > 0);
      const maCzytanie = s.maAktora && (s.hazardWartosc > 0 || s.intuicjaWartosc > 0);
      const maObciazone = s.maAktora && s.maObciazoneKosci;

      let koniecTury = false;
      let podmiany = 0;                                // podmiany kosci akcja Oszukaj w tej turze
      const limitPodmian = Math.min(3, Math.max(1, s.szulerPoziom)); // raz na runde; wiecej podmian dopiero z wyzszym poziomem Szulera (maks. 3)
      const limitCzytan = Math.max(1, s.szostyZmyslPoziom);            // Czytaj z twarzy: raz na gre; wiecej z wyzszym poziomem Szostego Zmyslu
      const limitSzczescia = Math.max(1, s.szczescieMax);             // raz na runde; wiecej z wyzszym poziomem talentu Szczescie

      while (!koniecTury) {
        const rywaleZywi = stanyRundy.filter((r) => r !== stan && !r.spasowal && !r.zdyskwalifikowany);
        const czytDisabled = (maCzytanie && g.czytaniaUzyte < limitCzytan && rywaleZywi.length > 0) ? "" : "disabled";
        const oszDisabled = (maOszustwo && podmiany < limitPodmian) ? "" : "disabled";
        const szcDisabled = (szczescieDostepne(g) > 0 && stan.szczescieRunda < limitSzczescia) ? "" : "disabled";
        const stacNaPodbicie = stacNa(g, 1);
        const podbijDisabled = (!stan.podbilWRundzie && podbiciaWRundzie < 3 && rywaleZywi.length > 0 && stacNaPodbicie) ? "" : "disabled";
        const obcDisabled = (maOszustwo && !g.kosciObciazone && !stan.obciazoneProba) ? "" : "disabled";

        let kosciHTML = "";
        for (const k of stan.kosci) kosciHTML += rysujKoscHTML(k, true);

        const panelHTML = '<div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:center; margin-top:10px; padding-top:8px; border-top:1px solid #5c4632;">' +
          '<button type="button" data-poker="podbij" ' + podbijDisabled + ' title="' + (stacNaPodbicie ? "Podbicie o wpisaną kwotę (raz na rundę, maks. 3 podbicia na rundę)" : "Brak monet w sakiewce") + '" style="font-size:11px; padding:4px 8px; cursor:pointer; color:#f59e0b;"><i class="fa-solid fa-coins"></i> Podbij stawkę (' + podbiciaWRundzie + '/3)</button>' +
          '<button type="button" data-poker="pas" style="font-size:11px; padding:4px 8px; cursor:pointer; color:#fca5a5;" title="Wpłacona stawka zostaje w puli"><i class="fa-solid fa-flag"></i> Pasuję</button>' +
          '<button type="button" data-poker="czytanie" ' + czytDisabled + ' title="Limit na całą grę: 1, a więcej z wyższym poziomem talentu Szósty Zmysł (teraz ' + limitCzytan + ')" style="font-size:11px; padding:4px 8px; cursor:pointer;"><i class="fa-solid fa-eye"></i> Czytaj z twarzy (w grze ' + g.czytaniaUzyte + '/' + limitCzytan + ')</button>' +
          '<button type="button" data-poker="oszukaj" ' + oszDisabled + ' title="Wymaga umiejętności Zwinne Palce albo talentu Szuler. Raz na rundę; więcej podmian z wyższym poziomem Szulera (teraz ' + limitPodmian + '). Każda podmiana to osobny test przeciwstawny." style="font-size:11px; padding:4px 8px; cursor:pointer;"><i class="fa-solid fa-hand-sparkles"></i> Oszukaj (Zwinne Palce / Szuler) — podmiany ' + podmiany + '/' + limitPodmian + '</button>' +
          (maObciazone ? '<button type="button" data-poker="obciazone" ' + obcDisabled + ' title="Wymaga umiejętności Zwinne Palce albo talentu Szuler. Próba raz na rundę; działa do wykrycia lub końca meczu" style="font-size:11px; padding:4px 8px; cursor:pointer; color:#fca5a5;"><i class="fa-solid fa-dice-d6"></i> Obciążone kości' + (g.kosciObciazone ? " (aktywne)" : "") + '</button>' : '') +
          '<button type="button" data-poker="szczescie" ' + szcDisabled + ' style="font-size:11px; padding:4px 8px; cursor:pointer; color:#ffd700;"><i class="fa-solid fa-clover"></i> Szczęście Ranalda (' + stan.szczescieRunda + '/' + limitSzczescia + ' w rundzie, punkty: ' + szczescieDostepne(g) + ')</button>' +
          '</div>';

        let akcjaSpecjalna = null;

        const wynikPanelu = await DialogV2.prompt({
          dla: g,
          zdalne: { tryb: "panel", naAkcje: (a) => { akcjaSpecjalna = a; } },
          autoOdp: async () => {
            if (stan.autoProbaPodbicia || podbijDisabled !== "") return true;
            const kwotaAuto = kwotaPodbiciaAutomatu(stan.uklad.ranga, stawkaMP, portfelMP(g));
            if (kwotaAuto < 1 || akcjaAutomatu(stan.uklad.ranga, stacNa(g, kwotaAuto)) !== "podbij") return true;
            stan.autoProbaPodbicia = true;
            akcjaSpecjalna = "podbij";
            await szeptDoMG("<strong>[BN — automat]</strong> " + g.nH + " podbija stawkę (ręka: " + stan.uklad.nazwa + ").");
            return null;
          },
          window: { title: "Kościany Poker — Przy stole: " + g.nazwa },
          content: '<div style="text-align:center; padding:6px 4px;">' +
            naglowekTuryHTML(g, "RUNDA " + numerRundy + " · AKCJE PRZY STOLE", nastF3Html) +
            '<div style="margin-bottom:6px;">' + chipyHTML(wpisyFaza3(stanyRundy, stan), false) + '</div>' +
            '<p style="margin-bottom:6px; font-size:15px;">Twoja ręka: <strong style="color:#7ae582;">' + stan.uklad.nazwa + '</strong></p>' +
            '<div style="display:flex; justify-content:center; gap:5px; margin-bottom:8px;">' + kosciHTML + '</div>' +
            '<p style="margin-bottom:4px; font-size:12px; opacity:0.9;">Wybierz akcję albo zakończ turę:</p>' +
            panelHTML +
            '</div>',
          render: (event, dialog) => renderPanelAkcji(dialog, (a) => { akcjaSpecjalna = a; }),
          ok: {
            label: "Zakończ turę",
            icon: "fa-solid fa-check",
            callback: () => true
          },
          rejectClose: false
        });

        // Przycisk "Zakończ turę" (wynik true) ZAWSZE kończy turę
        if (wynikPanelu === true) {
          koniecTury = true;
          continue;
        }
        // Okno zamkniete krzyzykiem: MG decyduje - wrocic, pominac gracza albo przerwac mecz
        if (!["podbij", "pas", "czytanie", "oszukaj", "obciazone", "szczescie"].includes(akcjaSpecjalna)) {
          const dec = await pytanieOZamknieciu(g, "gracz kończy turę bez dalszych akcji (jego ręka zostaje taka, jaka jest).");
          if (dec === "przerwij") return await przerwijMecz();
          if (dec === "pomin") {
            await ogloszPominiecie(g, g.nH + " — TURA POMINIĘTA", "Mistrz Gry kończy turę gracza bez dalszych akcji.");
            koniecTury = true;
          }
          continue;
        }

        try {
        // Pas dobrowolny: wpłacona stawka zostaje w puli
        if (akcjaSpecjalna === "pas") {
          const potwPas = await DialogV2.confirm({
            dla: g,
            window: { title: "Pasuję — " + g.nazwa },
            content: '<p style="text-align:center;">Spasować w tej rundzie? Wpłacone dotąd <strong>' + formatujWaluteWFRP(g.wplacono) + '</strong> zostaje w puli.</p>',
            yes: { label: "Pasuję", icon: "fa-solid fa-flag" },
            no: { label: "Anuluj", icon: "fa-solid fa-xmark" },
            rejectClose: false
          });
          if (potwPas === true) {
            stan.spasowal = true;
            koniecTury = true;
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker(),
              content: komunikatHTML("pas", g.nH + " PASUJE", "Wpłacona stawka zostaje w puli.")
            });
          }
          continue;
        }

        // Podbicie stawki: kwota wpisywana recznie, rywale doplacaja (all-in za reszte) albo pasuja
        if (akcjaSpecjalna === "podbij") {
          const kwotaMP = await pytanieOKwote(g, "Podbij stawkę — " + g.nazwa, "Wpisz kwotę podbicia. Każdy gracz, który zostaje w rundzie, musi się zgodzić: dopłaca tyle samo (albo wchodzi all-in za to, co ma) albo pasuje.", "Podbijam",
            g.auto ? kwotaPodbiciaAutomatu(stan.uklad.ranga, stawkaMP, portfelMP(g)) : undefined);
          if (kwotaMP === null || kwotaMP <= 0) {
            ui.notifications.info("Podbicie anulowane (kwota 0).");
            continue;
          }
          if (!stacNa(g, kwotaMP)) {
            ui.notifications.warn(g.nazwa + " nie ma tyle w sakiewce (" + formatujWaluteWFRP(pobierzStanSakiewkiMP(g.actor) ?? 0) + ").");
            continue;
          }

          // Weto MG (gdy postacia steruje gracz): zatwierdz / zablokuj / wymus pas
          if (g.userId) {
            const decyzjaMG = await DialogV2.wait({
              window: { title: "MG: podbicie — " + g.nazwa },
              content: '<p style="text-align:center;"><strong>' + g.nH + '</strong> chce podbić stawkę o <strong>' + formatujWaluteWFRP(kwotaMP) + '</strong>.</p>',
              buttons: [
                { action: "ok", label: "Zatwierdź", icon: "fa-solid fa-check", default: true },
                { action: "blokuj", label: "Zablokuj podbicie", icon: "fa-solid fa-ban" },
                { action: "pas", label: "Wymuś pas", icon: "fa-solid fa-flag" }
              ],
              rejectClose: false
            });
            if (decyzjaMG === "pas") {
              stan.spasowal = true;
              koniecTury = true;
              await szeptDoMG("<strong>[Podbicie stawki]</strong> MG wymusił pas gracza " + g.nH + ".");
              await ChatMessage.create({
                speaker: ChatMessage.getSpeaker(),
                content: komunikatHTML("pas", g.nH + " — PAS WYMUSZONY", "Mistrz Gry wymusza pas. Stawka zostaje w puli.")
              });
              continue;
            }
            if (decyzjaMG !== "ok") {
              await szeptDoMG("<strong>[Podbicie stawki]</strong> MG zablokował podbicie gracza " + g.nH + ".");
              await ChatMessage.create({
                speaker: ChatMessage.getSpeaker(),
                content: komunikatHTML("now", "PODBICIE ZABLOKOWANE", "Mistrz Gry blokuje podbicie gracza " + g.nH + ". Stawka bez zmian.")
              });
              continue;
            }
          }

          stan.podbilWRundzie = true;
          podbiciaWRundzie += 1;
          ustawKomunikat(g.nazwa + " podbija stawkę o " + formatujWaluteWFRP(kwotaMP) + ". Pozostali muszą się zgodzić albo spasować.");
          await szeptDoMG("<strong>[Podbicie stawki]</strong> " + g.nH + " podbija o " + formatujWaluteWFRP(kwotaMP) + " (ręka: " + stan.uklad.nazwa + ").");
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker(),
            content: '<div style="background:rgba(45, 25, 10, 0.92); border:1px solid #f59e0b; border-radius:6px; padding:8px; color:#fef3c7; text-align:center; font-size:12px;">' +
              '<strong>' + g.nH + ' podbija stawkę o ' + formatujWaluteWFRP(kwotaMP) + '!</strong> Pozostali gracze muszą dorzucić do puli lub spasować rundę.</div>'
          });
          // Zgoda wszystkich aktywnych graczy: kazdy, kto zostaje w rundzie, sam decyduje (widzi swoja reke, pule i koszt).
          // BN grajacy automatycznie oceniaja swoje kosci, kwote, pule i sakiewke. Zamkniecie okna nie jest zgoda ani pasem:
          // o tym, co dalej, decyduje MG (wroc do okna / pomin = pas / przerwij mecz).
          const rywaleDoDecyzji = [...rywaleZywi];
          for (const inny of rywaleDoDecyzji) {
            const og = inny.graczObj;
            const portfel = portfelMP(og);
            let doplata = 0;
            let brakMonet = false;
            if (portfel < 1) {
              brakMonet = true; // pas ogłasza jeden wspólny komunikat poniżej
            } else {
              const allIn = portfel < kwotaMP;
              const kwotaDoplaty = allIn ? portfel : kwotaMP;
              const rywaleWGrze = stanyRundy.filter((r) => r !== inny && !r.spasowal && !r.zdyskwalifikowany).length;
              let kosciInnegoHTML = "";
              for (const k of inny.kosci) kosciInnegoHTML += rysujKoscHTML(k, true);
              let decyzja = null;
              while (decyzja === null) {
                let odp = null;
                if (await ekranOslonowy(og, "Podbicie stawki — musisz się zgodzić (dopłacić) albo spasować", wpisyFaza3(stanyRundy, stan))) {
                  odp = await DialogV2.confirm({
                    dla: og,
                    autoOdp: () => doplataAutomatu(inny.kosci, { kwota: kwotaMP, portfel: portfel, pula: calaPulaMP, rywale: rywaleWGrze }),
                    window: { title: "Podbicie stawki — " + og.nazwa },
                    content: '<div style="text-align:center; padding:6px 4px;">' +
                      '<p><strong>' + g.nH + '</strong> podbił stawkę o <strong>' + formatujWaluteWFRP(kwotaMP) + '</strong>. Pula po podbiciu: <strong>' + formatujWaluteWFRP(calaPulaMP + kwotaMP) + '</strong>.</p>' +
                      '<p style="margin:6px 0 4px; font-size:13px;">Twoja ręka: <strong style="color:#7ae582;">' + inny.uklad.nazwa + '</strong></p>' +
                      '<div style="display:flex; justify-content:center; gap:5px; margin-bottom:8px;">' + kosciInnegoHTML + '</div>' +
                      '<p>' + (allIn ? 'Masz tylko <strong>' + formatujWaluteWFRP(portfel) + '</strong> — możesz wejść <strong>all-in</strong> albo spasować.' : 'Czy <strong>' + og.nH + '</strong> zgadza się dopłacić do puli, czy pasuje tę rundę?') + '</p></div>',
                    yes: { label: allIn ? "All-in (" + formatujWaluteWFRP(kwotaDoplaty) + ")" : "Zgadzam się — dopłać " + formatujWaluteWFRP(kwotaDoplaty), icon: "fa-solid fa-coins" },
                    no: { label: "Pasuję rundę", icon: "fa-solid fa-flag" },
                    rejectClose: false
                  });
                }
                if (odp === true || odp === false) {
                  decyzja = odp;
                  break;
                }
                const dec = await pytanieOZamknieciu(og, "gracz pasuje w tej rundzie (nie zgodził się na podbicie).");
                if (dec === "przerwij") return await przerwijMecz();
                if (dec === "pomin") decyzja = false;
              }
              if (decyzja === true) doplata = kwotaDoplaty;
              if (og.auto) {
                await szeptDoMG("<strong>[BN — automat]</strong> " + og.nH + (decyzja ? " zgadza się na podbicie" : " pasuje przy podbiciu") + " (ręka: " + inny.uklad.nazwa + ").");
              }
            }
            if (doplata > 0) {
              await wplacDoPuli(og, doplata);
              if (doplata < kwotaMP) og.allIn = true;
              zagrajDzwiek("zetony");
              await ChatMessage.create({
                speaker: ChatMessage.getSpeaker(),
                content: doplata < kwotaMP
                  ? komunikatHTML("now", og.nH + " — ALL-IN", "Wchodzi za " + formatujWaluteWFRP(doplata) + ".")
                  : komunikatHTML("done", og.nH + " DOPŁACA", formatujWaluteWFRP(doplata))
              });
            } else {
              inny.spasowal = true;
              await ChatMessage.create({
                speaker: ChatMessage.getSpeaker(),
                content: komunikatHTML("pas", og.nH + " PASUJE", brakMonet ? "Nie ma ani pensa na dopłatę. Wpłacona stawka zostaje w puli." : "Nie zgodził się na podbicie. Wpłacona stawka zostaje w puli.")
              });
            }
          }
          await wplacDoPuli(g, kwotaMP);
          g.podbil = true;
          zagrajDzwiek("zetony");
          ui.notifications.info("Podbicie zakończone. Pula: " + formatujWaluteWFRP(calaPulaMP) + ".");
          continue;
        }

        // Czytaj z twarzy: wybrany rywal, raz na rundę na kazdego; podpowiedz zalezy od przewagi w PS
        if (akcjaSpecjalna === "czytanie") {
          const rywal = await wybierzRywala(
            g,
            rywaleZywi,
            "Czytaj z twarzy — " + g.nazwa,
            "Którego gracza chcesz przejrzeć? (test Hazardu/Intuicji przeciw jego Opanowaniu; limit na całą grę: " + limitCzytan + ", użyto: " + g.czytaniaUzyte + ")",
            "Czytaj z twarzy"
          );
          if (!rywal) {
            ui.notifications.info("Nie wybrano rywala — akcja nie została wykorzystana.");
            continue;
          }
          g.czytaniaUzyte += 1;
          const szz = szostyZmyslDoTestu(s.szostyZmyslPoziom, szostyZmyslTryb);
          const umiejGracza = Math.max(s.hazardWartosc, s.intuicjaWartosc) + szz.celPlus;
          const obronaRywala = Math.max(rywal.graczObj.statystyki.opanowanieWartosc, rywal.graczObj.statystyki.hazardWartosc) || 35;
          const rzutGracza = await new Roll("1d100").evaluate();
          const rzutRywala = await new Roll("1d100").evaluate();
          const uzytoHazardu = s.hazardWartosc >= s.intuicjaWartosc; // talent Szuler Kościany wspiera Hazard, nie Intuicję
          const tg0 = wynikZSzulerem(umiejGracza, rzutGracza.total, uzytoHazardu ? s.szulerPoziom : 0);
          const tg = (tg0.sukces && szz.psPlus > 0) ? { ...tg0, sl: tg0.sl + szz.psPlus } : tg0; // Szosty Zmysl w trybie PS: +1 PS za poziom przy udanym tescie
          const tr = wynikTestu(obronaRywala, rzutRywala.total);
          const roznica = tg.sl - tr.sl;
          const tekst = podpowiedzCzytania(stan.uklad, rywal.uklad, roznica);

          await szeptDoMG("<strong>[Czytanie z twarzy — " + (tekst ? "SUKCES" : "PORAŻKA") + "]</strong> " + g.nH + " → " + rywal.graczObj.nH +
            ". Rzut: <strong>" + rzutGracza.total + "</strong> na cel <strong>" + umiejGracza + "</strong> (PS " + tg.sl + ") vs rywal: rzut <strong>" + rzutRywala.total + "</strong> na cel <strong>" + obronaRywala + "</strong> (PS " + tr.sl + "), różnica " + roznica +
            ". Ręka rywala: <strong>" + rywal.uklad.nazwa + "</strong>." + (tekst ? " Podpowiedź: " + tekst : ""));
          if (tekst) {
            await szeptDoGraczaIMG(g.userId, "<strong>[Czytanie z twarzy — SUKCES]</strong> <strong>" + g.nH + "</strong> przejrzał przeciwnika (<strong>" + rywal.graczObj.nH + "</strong>)!<br/><em>" + tekst + "</em>");
          } else {
            await szeptDoGraczaIMG(g.userId, "<strong>[Czytanie z twarzy — PORAŻKA]</strong> <strong>" + g.nH + "</strong> próbował wyczytać intencje gracza <strong>" + rywal.graczObj.nH + "</strong>, ale nic z tego nie wyniósł.");
          }
          continue;
        }

        // Oszukaj: podmiana kosci (test przeciwstawny Zwinnych Palcow z kazdym rywalem osobno)
        if (akcjaSpecjalna === "oszukaj") {
          const dodKara = stan.obciazoneProba ? 20 : 0;
          const wyborOszustwa = await oknoOszukaj(g, stan, stanyRundy, dodKara, podmiany, limitPodmian);

          if (wyborOszustwa) {
            podmiany += 1;
            stan.uzylPodmiany = true;
            const w = await probaOszustwa(g, stan, stanyRundy, dodKara);
            const stareOczko = stan.kosci.at(wyborOszustwa.idx);
            const pozostalo = limitPodmian - podmiany;
            const resztaTekst = pozostalo > 0 ? " Pozostałe podmiany w tej turze: " + pozostalo + "." : " To była ostatnia podmiana w tej turze.";
            if (w.wynik === "udane") {
              stan.kosci.splice(wyborOszustwa.idx, 1, wyborOszustwa.val);
              stan.uklad = ocenUklad(stan.kosci);
              await szeptDoMG("<strong>[UDANE OSZUSTWO]</strong> <strong>" + g.nH + "</strong> po cichu podmienił kość #" + (wyborOszustwa.idx + 1) + " z <strong>" + stareOczko + "</strong> na <strong>" + wyborOszustwa.val + "</strong>. " + opisTestuOszusta(w));
              await szeptWynikOszustwa(g, w, "Oszustwo — SUKCES", "Twoje PS przewyższają PS każdego rywala. Kość #" + (wyborOszustwa.idx + 1) + " zmieniona z " + stareOczko + " na " + wyborOszustwa.val + "." + resztaTekst);
              await szeptReke(g, stan.kosci, "po podmianie: <strong>" + stan.uklad.nazwa + "</strong>");
              ui.notifications.info("Udało Ci się niepostrzeżenie podmienić kość!");
            } else if (w.wynik === "nieudane") {
              await szeptDoMG("<strong>[Oszustwo — remis]</strong> " + g.nH + ": kość nie dała się podmienić, ale nikt nic nie zauważył. " + opisTestuOszusta(w));
              await szeptWynikOszustwa(g, w, "Oszustwo — REMIS", "Twoje PS są równe PS któregoś rywala. Kość #" + (wyborOszustwa.idx + 1) + " zostaje bez zmian (" + stareOczko + "), a nikt niczego nie zauważył. Próba została zużyta." + resztaTekst);
              ui.notifications.info("Podmiana się nie udała, ale nikt nic nie zauważył.");
            } else {
              await szeptDoMG(opisTestuOszusta(w));
              await szeptWynikOszustwa(g, w, "Oszustwo — PRZYŁAPANY", (w.przylapal ? esc(w.przylapal) : "Któryś z rywali") + " zauważył podmianę (stopień przyłapania " + w.stopien + "). Odpadasz z tej rundy i z całego meczu, a Twoja stawka zostaje w puli.");
              await przylapanyOszust(g, stan, w, "gdy ten próbował podmienić kość " + stareOczko + " na " + wyborOszustwa.val, false);
              koniecTury = true;
            }
          }
          continue;
        }

        // Obciazone kosci: test Zwinnych Palcow (wprowadzenie do kubka), potem wazone rzuty do konca meczu lub wykrycia
        if (akcjaSpecjalna === "obciazone") {
          const dodKara = stan.uzylPodmiany ? 20 : 0;
          const wyborObc = await oknoObciazone(g, stan, stanyRundy, dodKara);

          if (wyborObc !== null) {
            stan.obciazoneProba = true;
            const w = await probaOszustwa(g, stan, stanyRundy, dodKara);
            if (w.wynik === "udane") {
              g.kosciObciazone = { ulubiona: wyborObc };
              await szeptDoMG("<strong>[OBCIĄŻONE KOŚCI — wprowadzone]</strong> " + g.nH + " faworyzuje oczko " + wyborObc + ". " + opisTestuOszusta(w));
              await szeptWynikOszustwa(g, w, "Obciążone kości — SUKCES", "Twoje PS przewyższają PS każdego rywala. Kości w kubku są podmienione — Twoje rzuty faworyzują oczko " + wyborObc + ". Uważaj: przed każdym rozstrzygnięciem rywale spróbują je zauważyć.");
              ui.notifications.info("Obciążone kości trafiły do kubka niezauważone.");
            } else if (w.wynik === "nieudane") {
              await szeptDoMG("<strong>[Obciążone kości — remis]</strong> " + g.nH + ": nie udało się wprowadzić kości, ale nikt nic nie zauważył. " + opisTestuOszusta(w));
              await szeptWynikOszustwa(g, w, "Obciążone kości — REMIS", "Twoje PS są równe PS któregoś rywala. Obciążone kości nie trafiły do kubka, a nikt niczego nie zauważył. Próba została zużyta.");
              ui.notifications.info("Nie udało się wprowadzić obciążonych kości, ale nikt nic nie zauważył.");
            } else {
              await szeptDoMG(opisTestuOszusta(w));
              await szeptWynikOszustwa(g, w, "Obciążone kości — PRZYŁAPANY", (w.przylapal ? esc(w.przylapal) : "Któryś z rywali") + " zauważył obciążone kości (stopień przyłapania " + w.stopien + "). Odpadasz z tej rundy i z całego meczu, kości zostają skonfiskowane, a Twoja stawka zostaje w puli.");
              await przylapanyOszust(g, stan, w, "gdy ten wprowadzał do kubka obciążone kości", true);
              koniecTury = true;
            }
          }
          continue;
        }

        // Szczescie Ranalda: Punkty Szczescia z karty (punkt zuzywany po wyborze kosci)
        if (akcjaSpecjalna === "szczescie") {
          const wyborKosciSzc = await DialogV2.prompt({
            dla: g,
            window: { title: "Szczęście Ranalda — Wybierz 1 kość" },
            content: '<div style="padding:8px; text-align:center;">' +
              '<p>Wybierz jedną kość, którą przerzucisz dzięki łasce Ranalda (zużywa Punkt Szczęścia):</p>' +
              '<select name="luck_die" style="width:80%; margin-top:8px;">' +
              stan.kosci.map((k, idx) => '<option value="' + idx + '">Kość #' + (idx + 1) + ' (wartość: ' + k + ')</option>').join("") +
              '</select></div>',
            ok: {
              label: "Przerzuć szczęśliwą kość",
              icon: "fa-solid fa-clover",
              callback: (event, button) => Number(button.form.elements.namedItem("luck_die")?.value) || 0
            },
            rejectClose: false
          });

          if (wyborKosciSzc !== null) {
            await zuzyjSzczescie(g);
            stan.szczescieRunda += 1;
            await szeptDoMG("<strong>[Szczęście Ranalda]</strong> <strong>" + g.nH + "</strong> zużył punkt Szczęścia (pozostało: " + szczescieDostepne(g) + ").");
            await przerzutUkryty(g, stan, wyborKosciSzc, "Szczęście Ranalda — Przerzut 1 kości");
          }
          continue;
        }
        } catch (err) {
          // Blad w akcji nie moze zablokowac tury: pokaz komunikat i wroc do panelu
          console.error("Kościany Poker — błąd akcji " + akcjaSpecjalna, err);
          ui.notifications.error("Kościany Poker: błąd akcji (" + akcjaSpecjalna + "): " + (err && err.message ? err.message : err));
          continue;
        }
      }
      stan.skonczyl = true;
    }

    // Faza 3b: kontrola kosci - przed rozstrzygnieciem rywale probuja zauwazyc obciazone kosci (kara -20, znoszona przez zestaw lub Hazard 40+)
    for (const stan of stanyRundy) {
      const g = stan.graczObj;
      if (!g.kosciObciazone || stan.zdyskwalifikowany) continue;
      const wyniki = [];
      for (const r of stanyRundy.filter((x) => x !== stan && !x.graczObj.wyrzucony)) {
        const st = r.graczObj.statystyki;
        const bezKary = st.maZestawKosci || st.hazardWartosc >= 40;
        const baza = Math.max(st.percepcjaWartosc, st.hazardWartosc) || 35;
        const cel = Math.max(1, baza - (bezKary ? 0 : 20));
        const rz = await new Roll("1d100").evaluate();
        const t = wynikTestu(cel, rz.total);
        wyniki.push({ nazwa: r.graczObj.nazwa, rzut: rz.total, cel: cel, sl: t.sl, sukces: t.sukces });
      }
      const zauwazyli = wyniki.filter((w) => w.sukces);
      await szeptDoMG("<strong>[Kontrola obciążonych kości]</strong> " + g.nH + ": " + (wyniki.map((w) => esc(w.nazwa) + " " + w.rzut + "/" + w.cel + (w.sukces ? " (ZAUWAŻYŁ)" : "")).join(", ") || "brak rywali") + ".");
      if (zauwazyli.length > 0) {
        const top = zauwazyli.reduce((acc, w) => (w.sl > acc.sl ? w : acc));
        await przylapanyOszust(g, stan, { przylapal: top.nazwa, stopien: stopienPrzylapania(Math.max(1, top.sl)) }, "gdy po stole toczyły się obciążone kości", true);
      }
    }

    // Faza 4: rozstrzygniecie rundy
    const kwalifikowani = stanyRundy.filter((s) => !s.spasowal && !s.zdyskwalifikowany);
    kwalifikowani.sort((a, b) => (b.uklad.ranga - a.uklad.ranga) || (b.uklad.tieBreaker - a.uklad.tieBreaker));
    for (const st of stanyRundy) {
      st.graczObj.ostatniUklad = (st.spasowal || st.zdyskwalifikowany) ? { ranga: -1, tieBreaker: 0 } : { ranga: st.uklad.ranga, tieBreaker: st.uklad.tieBreaker };
    }

    let zwyciezcyRundy = [];
    if (kwalifikowani.length > 0) {
      const pierwszy = kwalifikowani.at(0);
      zwyciezcyRundy = kwalifikowani.filter((k) => k.uklad.ranga === pierwszy.uklad.ranga && k.uklad.tieBreaker === pierwszy.uklad.tieBreaker);
    }

    let opisRundy = "";
    if (kwalifikowani.length === 0) {
      opisRundy = "Nikt nie zdobywa punktu w tej rundzie.";
    } else if (zwyciezcyRundy.length === 1) {
      const z = zwyciezcyRundy.at(0);
      z.graczObj.wygraneRundy += 1;
      opisRundy = kwalifikowani.length === 1
        ? "Rundę " + numerRundy + " wygrywa <strong>" + z.graczObj.nH + "</strong>!"
        : "Rundę " + numerRundy + " wygrywa <strong>" + z.graczObj.nH + "</strong> (" + z.uklad.nazwa + ")!";
    } else {
      opisRundy = "Remis w rundzie " + numerRundy + "! " + (trybR ? "Pula zostanie podzielona po równo." : "Nikt nie zdobywa punktu.");
    }

    let wierszeRundyHTML = "";
    for (const s of stanyRundy) {
      let maleKosciHTML = "";
      for (const k of s.kosci) {
        maleKosciHTML += rysujKoscHTML(k, true);
      }
      const statusTekst = s.zdyskwalifikowany ? " [ZDYSKWALIFIKOWANY]" : (s.spasowal ? " [PAS]" : "");
      wierszeRundyHTML += '<div style="background:rgba(255,255,255,0.05); border:1px solid #5c4632; border-radius:6px; padding:6px; margin-bottom:6px;">' +
        '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">' +
        '<strong>' + s.graczObj.nH + statusTekst + ' (Wygrane rundy: ' + s.graczObj.wygraneRundy + (trybR ? '' : '/' + wymaganeWygrane) + ')</strong>' +
        '<span style="color:#e5c158;">' + s.uklad.nazwa + '</span>' +
        '</div>' +
        '<div style="display:flex; justify-content:center; gap:5px;">' + maleKosciHTML + '</div>' +
        '</div>';
    }

    if (stolWlaczony) {
      // Odkrycie kart: wszystkie reki, ktore dotrwaly do konca, stają sie jawne, zwyciezca jest podswietlony
      const zwyc = new Set(zwyciezcyRundy.map((z) => z.graczObj));
      for (const st of stanyRundy) {
        if (!st.spasowal && !st.zdyskwalifikowany) {
          stolKosci.set(st.graczObj, { tryb: "odkryte", kosci: [...st.kosci], uklad: st.uklad.nazwa, zwyciezca: zwyc.has(st.graczObj) });
        }
      }
      stolSrodek = {
        etykieta: "RUNDA " + numerRundy + " — ROZSTRZYGNIĘCIE",
        rola: zwyciezcyRundy.length === 0 ? "BRAK ZWYCIĘZCY" : (zwyciezcyRundy.length === 1 ? "ZWYCIĘZCA RUNDY" : "REMIS"),
        imie: zwyciezcyRundy.length === 0 ? "Nikt" : zwyciezcyRundy.map((z) => z.graczObj.nazwa).join(" i "),
        nastepnyHTML: zwyciezcyRundy.length > 0 ? esc(zwyciezcyRundy.at(0).uklad.nazwa) : ""
      };
      stolFn = {
        fn: () => stanyRundy.map((st) => {
          if (st.zdyskwalifikowany || st.graczObj.wyrzucony) return { nazwa: st.graczObj.nazwa, typ: "out", tekst: "WYRZUCONY" };
          if (st.spasowal) return { nazwa: st.graczObj.nazwa, typ: "pas", tekst: "PAS" };
          if (zwyc.has(st.graczObj)) return { nazwa: st.graczObj.nazwa, typ: "done", tekst: zwyciezcyRundy.length > 1 ? "REMIS" : "ZWYCIĘZCA" };
          return { nazwa: st.graczObj.nazwa, typ: "wait", tekst: "przegrywa" };
        }),
        gracze: stanyRundy.map((st) => st.graczObj)
      };
      stolKomunikat = "";
      stolAnimacja = null;
      if (zwyciezcyRundy.length > 0) stolDzwiek = { id: idMeczu + "-d" + (++stolLicznik), typ: "gong" };
      await stolOdswiez();
      await czekaj(Math.max(3, czasBaneru) * 1000);
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker(),
      content: '<div style="background:rgba(20, 18, 15, 0.94); border:1px solid #8c6d46; border-radius:8px; padding:10px; color:#f0e6d2;">' +
        '<h4 style="margin:0 0 8px 0; text-align:center; color:#e5c158;">Podsumowanie Rundy ' + numerRundy + '</h4>' +
        wierszeRundyHTML +
        '<div style="text-align:center; font-size:13px; color:#7ae582; font-weight:bold; margin-top:6px;">' + opisRundy + '</div>' +
        '</div>'
    });

    if (trybR) {
      // Wyplata za kazda runde: zwyciezca (albo podzial przy remisie); brak zwyciezcy = pula zostaje na kolejna runde
      if (zwyciezcyRundy.length > 0) {
        const tieryRundy = [];
        for (const k of kwalifikowani) {
          const ost = tieryRundy.at(-1);
          if (ost && ost.uklad.ranga === k.uklad.ranga && ost.uklad.tieBreaker === k.uklad.tieBreaker) ost.gracze.push(k.graczObj);
          else tieryRundy.push({ uklad: k.uklad, gracze: [k.graczObj] });
        }
        const wyplata = await wyplacPule(tieryRundy.map((t) => t.gracze));
        const linie = wyplata.wpisy.map((w) => esc(w.g.nazwa) + ": " + (w.zwyciezca ? "wygrywa " : "odbiera pulę boczną lub zwrot ") + formatujWaluteWFRP(w.kwota)).join("<br/>");
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker(),
          content: '<div style="text-align:center; font-size:12px; color:#ffd700;"><strong>Pula rundy: ' + formatujWaluteWFRP(wyplata.suma) + '</strong><br/>' + linie +
            (wyplata.reszta > 0 ? '<br/><em>Reszta ' + formatujWaluteWFRP(wyplata.reszta) + ' zostaje na kolejną rundę.</em>' : '') + '</div>'
        });
      } else {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker(),
          content: '<div style="text-align:center; font-size:12px; color:#ffd700;"><em>Pula ' + formatujWaluteWFRP(calaPulaMP) + ' przechodzi na kolejną rundę.</em></div>'
        });
      }
      const zywi = gracze.filter((g) => !g.wyrzucony);
      let dalej = false;
      if (zywi.length >= 2) {
        dalej = (await DialogV2.confirm({
          window: { title: "Kolejna runda?" },
          content: '<p style="text-align:center;">Zagrać kolejną rundę? Wpisowe zostanie pobrane ponownie.</p>',
          yes: { label: "Kolejna runda", icon: "fa-solid fa-dice" },
          no: { label: "Koniec gry", icon: "fa-solid fa-flag-checkered" },
          rejectClose: false
        })) === true;
      }
      if (!dalej) zwyciezcaMeczu = gracze.reduce((acc, g) => (g.wygraneRundy > acc.wygraneRundy ? g : acc), gracze.at(0));
    } else {
      zwyciezcaMeczu = gracze.find((g) => g.wygraneRundy >= wymaganeWygrane) || null;
    }
    numerRundy += 1;
  }

  // Wyplata na koniec meczu (tryb turniejowy) albo zwrot niewyplaconej puli (tryb rund)
  let wygrana = 0;
  if (!trybR) {
    // Pozostali: wedlug wygranych rund, a przy remisie wedlug ukladow z ostatniej rundy (do pul bocznych)
    const rangaOst = (g) => (g.ostatniUklad ? g.ostatniUklad.ranga : -1);
    const tbOst = (g) => (g.ostatniUklad ? g.ostatniUklad.tieBreaker : 0);
    const tieryMeczu = [[zwyciezcaMeczu]];
    const inniMeczu = gracze.filter((g) => g !== zwyciezcaMeczu && !g.wyrzucony)
      .sort((x, y) => (y.wygraneRundy - x.wygraneRundy) || (rangaOst(y) - rangaOst(x)) || (tbOst(y) - tbOst(x)));
    for (const g of inniMeczu) {
      const ost = tieryMeczu.at(-1);
      const p0 = ost.at(0);
      const taSama = tieryMeczu.length > 1 && p0.wygraneRundy === g.wygraneRundy && rangaOst(p0) === rangaOst(g) && tbOst(p0) === tbOst(g);
      if (taSama) ost.push(g);
      else tieryMeczu.push([g]);
    }
    const wyplata = await wyplacPule(tieryMeczu);
    const wpis = wyplata.wpisy.find((w) => w.g === zwyciezcaMeczu);
    wygrana = wpis ? wpis.kwota : 0;
  } else {
    for (const g of gracze) {
      if (autoMonety && g.actor && g.wplacono > 0) await wyplacNaSakiewke(g.actor, g.wplacono);
      g.wplacono = 0;
    }
    calaPulaMP = 0;
  }
  if (resztaPrzeniesiona > 0 && autoMonety && zwyciezcaMeczu.actor) await wyplacNaSakiewke(zwyciezcaMeczu.actor, resztaPrzeniesiona);
  resztaPrzeniesiona = 0;
  pulaWyplacona = true;
  await oznaczMigawke("zakonczony");
  if (stolWlaczony) {
    stolKoniec = true;
    stolSrodek = {
      etykieta: "KONIEC MECZU",
      rola: trybR ? "KONIEC GRY" : "ZWYCIĘZCA MECZU",
      imie: trybR ? "Dziękujemy za grę" : zwyciezcaMeczu.nazwa,
      nastepnyHTML: trybR ? gracze.map((g) => esc(g.nazwa) + " " + g.wygraneRundy).join(", ") : "Wygrana pula: <strong>" + esc(formatujWaluteWFRP(wygrana)) + "</strong>"
    };
    stolFn = {
      fn: () => gracze.map((g) => ({ nazwa: g.nazwa, typ: (!trybR && g === zwyciezcaMeczu) ? "done" : (g.wyrzucony ? "out" : "wait"), tekst: (!trybR && g === zwyciezcaMeczu) ? "ZWYCIĘZCA" : (g.wyrzucony ? "WYRZUCONY" : "wygrane rundy: " + g.wygraneRundy) })),
      gracze: gracze
    };
    stolKomunikat = "";
    stolAnimacja = null;
    await stolOdswiez();
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    content: '<div style="background:rgba(20, 35, 20, 0.95); border:2px solid #7ae582; border-radius:8px; padding:12px; color:#f0e6d2; text-align:center;">' +
      '<h3 style="margin:0 0 6px 0; color:#7ae582;">KONIEC MECZU KOŚCIANEGO POKERA!</h3>' +
      (trybR
        ? '<p style="font-size:14px; margin:6px 0;">Wygrane rundy: ' + gracze.map((g) => g.nH + " " + g.wygraneRundy).join(", ") + '</p>'
        : '<p style="font-size:15px; margin:6px 0;">Zwycięzcą zostaje <strong>' + zwyciezcaMeczu.nH + '</strong>!</p>' +
          '<p style="font-size:14px; color:#ffd700; margin:4px 0;">Wygrana pula: <strong>' + formatujWaluteWFRP(wygrana) + '</strong></p>') +
      '</div>'
  });
  } catch (err) {
    // Blad w trakcie meczu: oddaj wszystkim wpisowe i podbicia, zeby nikt nie stracil monet
    console.error("Kościany Poker — błąd meczu", err);
    ui.notifications.error("Kościany Poker: błąd (" + (err && err.message ? err.message : err) + "). Mecz przerwany.");
    if (!pulaWyplacona) await przerwijMecz();
  }
}

// ---- MIGAWKA SAKIEWEK: stan monet sprzed meczu, do przywrocenia po awarii lub przerwaniu ----
const KLUCZ_MIGAWKI = "migawka";

function odczytajMigawke() {
  try {
    const m = game.settings.get(ID_MODULU, KLUCZ_MIGAWKI);
    return (m && Array.isArray(m.gracze)) ? m : null;
  } catch (err) {
    return null;
  }
}

const ilosciMonety = (item) => Number(item.system.quantity?.value ?? item.system.quantity ?? 0);

async function zapiszMigawke(gracze, status) {
  try {
    const dane = { czas: Date.now(), status: status, gracze: [] };
    for (const g of gracze) {
      if (!g.actor) continue;
      dane.gracze.push({
        nazwa: g.nazwa,
        uuid: g.actor.uuid,
        monety: g.actor.items.filter((i) => i.type === "money").map((i) => ({ id: i.id, nazwa: i.name, ilosc: ilosciMonety(i) }))
      });
    }
    await game.settings.set(ID_MODULU, KLUCZ_MIGAWKI, dane);
  } catch (err) {
    console.warn("Kościany Poker — nie udało się zapisać stanu sakiewek", err);
  }
}

async function oznaczMigawke(status) {
  const m = odczytajMigawke();
  if (!m) return;
  try {
    await game.settings.set(ID_MODULU, KLUCZ_MIGAWKI, { ...m, status: status });
  } catch (err) {
    console.warn("Kościany Poker — nie udało się zaktualizować stanu sakiewek", err);
  }
}

function znajdzMonete(actor, id) {
  const items = actor.items;
  return (typeof items.get === "function" ? items.get(id) : null) || items.find((x) => x.id === id) || null;
}

// Zwraca opis zmian (wiersze HTML) miedzy zapisanym stanem a obecnym; pusta lista = sakiewki sie zgadzaja
async function roznicaSakiewek(m) {
  const wiersze = [];
  for (const wpis of m.gracze) {
    const actor = await fromUuid(wpis.uuid);
    if (!actor) {
      wiersze.push(esc(wpis.nazwa) + ": nie znaleziono postaci");
      continue;
    }
    const zmiany = [];
    for (const mon of wpis.monety) {
      const it = znajdzMonete(actor, mon.id);
      if (!it) continue;
      const teraz = ilosciMonety(it);
      if (teraz !== mon.ilosc) zmiany.push(esc(mon.nazwa) + " " + teraz + " → " + mon.ilosc);
    }
    if (zmiany.length > 0) wiersze.push("<strong>" + esc(wpis.nazwa) + "</strong>: " + zmiany.join(", "));
  }
  return wiersze;
}

async function przywrocSakiewki(m) {
  let przywrocone = 0;
  for (const wpis of m.gracze) {
    const actor = await fromUuid(wpis.uuid);
    if (!actor) continue;
    for (const mon of wpis.monety) {
      const it = znajdzMonete(actor, mon.id);
      if (!it || ilosciMonety(it) === mon.ilosc) continue;
      if (typeof it.system.quantity === "object") await it.update({ "system.quantity.value": mon.ilosc });
      else await it.update({ "system.quantity": mon.ilosc });
      przywrocone += 1;
    }
  }
  await game.settings.set(ID_MODULU, KLUCZ_MIGAWKI, { ...m, status: "przywrocony" });
  const gmIds = ChatMessage.getWhisperRecipients("GM").map((u) => u.id);
  if (gmIds.length > 0) {
    await ChatMessage.create({
      speaker: { alias: "Kronikarz Karczmy (MG)" },
      whisper: gmIds,
      content: '<div style="border-left:3px solid #a855f7; padding:6px 8px;">Przywrócono sakiewki sprzed meczu (zmieniono pozycji monet: ' + przywrocone + ').</div>'
    });
  }
  ui.notifications.info("Przywrócono sakiewki sprzed meczu.");
}

// Na starcie nowego meczu: jesli poprzedni nie zostal dokonczony (np. zamknieta przegladarka), zapytaj MG
async function sprawdzPoprzedniMecz() {
  const m = odczytajMigawke();
  if (!m || m.status !== "w_toku") return;
  const roznice = await roznicaSakiewek(m);
  const odp = await foundry.applications.api.DialogV2.wait({
    window: { title: "Poprzedni mecz nie został dokończony" },
    content: '<div style="padding:8px; font-size:13px;"><p>Poprzedni mecz Kościanego Pokera nie został dokończony (zapis z ' + new Date(m.czas).toLocaleString("pl-PL") + ').' +
      ' Wpłacone stawki mogły nie wrócić do sakiewek.</p>' +
      (roznice.length > 0 ? '<p><strong>Różnice względem stanu sprzed meczu:</strong></p><p>' + roznice.join("<br/>") + '</p>' : '<p>Sakiewki zgadzają się ze stanem sprzed meczu.</p>') + '</div>',
    buttons: [
      { action: "przywroc", label: "Przywróć sakiewki sprzed meczu", icon: "fa-solid fa-rotate-left", default: true },
      { action: "zostaw", label: "Zostaw jak jest", icon: "fa-solid fa-forward" }
    ],
    rejectClose: false
  });
  if (odp === "przywroc") await przywrocSakiewki(m);
  else if (odp === "zostaw") await oznaczMigawke("przerwany");
}

// Makro "Kościany Poker — przywróć sakiewki": ręczne przywrócenie stanu sprzed ostatniego meczu
export async function przywrocMigawke() {
  if (!game.user.isGM) {
    ui.notifications.warn("Sakiewki może przywrócić tylko Mistrz Gry.");
    return;
  }
  const m = odczytajMigawke();
  if (!m) {
    ui.notifications.info("Brak zapisanego stanu sakiewek — zapisuje się on na początku każdego meczu.");
    return;
  }
  const roznice = await roznicaSakiewek(m);
  const opisy = { w_toku: "mecz nie został dokończony", zakonczony: "mecz zakończony", przerwany: "mecz przerwany", przywrocony: "sakiewki już przywrócone" };
  const odp = await foundry.applications.api.DialogV2.wait({
    window: { title: "Przywróć sakiewki sprzed meczu" },
    content: '<div style="padding:8px; font-size:13px;"><p>Ostatni zapisany stan: <strong>' + new Date(m.czas).toLocaleString("pl-PL") + '</strong> (' + (opisy[m.status] || esc(m.status)) + ').</p>' +
      (roznice.length > 0
        ? '<p><strong>Po przywróceniu monety wrócą do:</strong></p><p>' + roznice.join("<br/>") + '</p><p style="color:#fca5a5;">Wygrane i straty z tego meczu zostaną cofnięte.</p>'
        : '<p>Sakiewki już zgadzają się z zapisanym stanem — nie ma czego przywracać.</p>') + '</div>',
    buttons: [
      { action: "przywroc", label: "Przywróć sakiewki", icon: "fa-solid fa-rotate-left", default: roznice.length > 0 },
      { action: "zostaw", label: "Anuluj", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (odp === "przywroc") await przywrocSakiewki(m);
}
