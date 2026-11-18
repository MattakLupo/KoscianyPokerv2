// Wejscie modulu Koscianny Poker: rejestracja zapytan do graczy, kanalu zdarzen i makr dla MG.
import * as silnik from "./silnik.js";
import { obsluzOkno, zamknijOkno } from "./okna-zdalne.js";
import { pokazBanerEkran, animujKubek, zamknijBaner, oczyscBaner } from "./ekran.js";
import { ID_MODULU, NAZWA_ZAPYTANIA, KANAL_SOCKET } from "./wspolne.js";
import { zastosujStol, otworzStol } from "./stol.js";
import { pokazDiagnostyke } from "./karty.js";

const tekst = (klucz, domyslny) => {
  const t = game.i18n && game.i18n.localize ? game.i18n.localize(klucz) : klucz;
  return t && t !== klucz ? t : domyslny;
};

// Zdarzenia od MG pokazywane na ekranie kazdego gracza (dane z sieci sa oczyszczane)
export function obsluzSocket(dane) {
  if (!dane || typeof dane !== "object") return;
  if (dane.typ === "baner") {
    const ms = Math.max(0, Math.min(60000, Number(dane.ms) || 0));
    pokazBanerEkran(oczyscBaner(dane.o || {}), ms);
  } else if (dane.typ === "banerZamknij") {
    zamknijBaner();
  } else if (dane.typ === "kubek") {
    animujKubek(String(dane.imie == null ? "" : dane.imie), String(dane.opis == null ? "" : dane.opis));
  } else if (dane.typ === "zamknij" && dane.userId === game.user.id) {
    zamknijOkno(String(dane.id));
  } else if (dane.typ === "stol") {
    zastosujStol(dane.stan, { lokalny: false });
  } else if (dane.typ === "stolPytanie" && game.user.isGM) {
    silnik.odswiezKlienta(String(dane.userId == null ? "" : dane.userId));
  }
}

Hooks.once("init", () => {
  CONFIG.queries[NAZWA_ZAPYTANIA] = obsluzOkno;
  game.settings.register(ID_MODULU, "migawka", { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(ID_MODULU, "makraUtworzone", { scope: "world", config: false, type: Boolean, default: false });
  // Ustawienia klienta: kazdy gracz i MG ma wlasne (Konfiguracja ustawien > Moduly)
  game.settings.register(ID_MODULU, "tempoAnimacji", { name: "Kościany Poker: tempo animacji kości", hint: "Jak długo kości lecą na stół na Twoim ekranie.", scope: "client", config: true, type: String, default: "normalnie",
    choices: { szybko: "Szybko", normalnie: "Normalnie", wolno: "Wolno" } });
  game.settings.register(ID_MODULU, "panelHistorii", { name: "Kościany Poker: panel przebiegu gry", hint: "Lista ostatnich zdarzeń w rogu stołu.", scope: "client", config: true, type: Boolean, default: true });
  game.settings.register(ID_MODULU, "dzwieki", { name: "Kościany Poker: dźwięki", hint: "Rzut kości, żetony przy podbiciu i gong przy rozstrzygnięciu rundy.", scope: "client", config: true, type: Boolean, default: true });
  game.settings.register(ID_MODULU, "glosnoscDzwiekow", { name: "Kościany Poker: głośność dźwięków", scope: "client", config: true, type: Number, default: 0.6, range: { min: 0, max: 1, step: 0.1 } });
  game.settings.register(ID_MODULU, "makroKartyUtworzone", { scope: "world", config: false, type: Boolean, default: false });
  const modul = game.modules.get(ID_MODULU);
  if (modul) modul.api = { start: silnik.uruchomPoker, przywroc: silnik.przywrocMigawke, stol: otworzStol, diagnostyka: pokazDiagnostyke };
});

Hooks.once("ready", async () => {
  game.socket.on(KANAL_SOCKET, obsluzSocket);
  // Gracz, ktory odswiezyl strone w trakcie meczu, prosi MG o ponowne wyslanie stolu i swojej reki
  if (!game.user.isGM) {
    try {
      game.socket.emit(KANAL_SOCKET, { typ: "stolPytanie", userId: game.user.id });
    } catch (err) {
      console.warn("Kościany Poker — nie udało się zapytać o stan stołu", err);
    }
  }
  if (!game.user.isGM) return;
  const komenda = (nazwaApi) => "game.modules.get('" + ID_MODULU + "').api." + nazwaApi + "();";
  await utworzMakra("makraUtworzone", [
    { name: tekst("KOSCIANY_POKER.MakroStart", "Kościany Poker"), command: komenda("start") },
    { name: tekst("KOSCIANY_POKER.MakroPrzywroc", "Kościany Poker — przywróć sakiewki"), command: komenda("przywroc") }
  ]);
  // makro dodane w wersji 1.5.0: osobna flaga, bo pierwsze dwa makra istnieja juz w starszych swiatach
  await utworzMakra("makroKartyUtworzone", [
    { name: tekst("KOSCIANY_POKER.MakroKarty", "Kościany Poker — sprawdź karty"), command: komenda("diagnostyka") }
  ]);
});

// Tworzy makra raz (flaga w ustawieniach swiata); makra usuniete przez MG nie wracaja
async function utworzMakra(flaga, definicje) {
  if (game.settings.get(ID_MODULU, flaga)) return;
  try {
    for (const d of definicje) {
      if (game.macros.some((m) => m.name === d.name)) continue;
      await Macro.create({ name: d.name, type: "script", img: "icons/svg/dice-target.svg", command: d.command });
    }
    await game.settings.set(ID_MODULU, flaga, true);
  } catch (err) {
    console.warn("Kościany Poker — nie udało się utworzyć makr", err);
  }
}
