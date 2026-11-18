// Okna Koscianego Pokera otwierane na komputerze gracza. Mistrz Gry wysyla zapytanie (User#query),
// gracz widzi okno, a jego odpowiedz wraca do MG jako zwykle dane. Zadne funkcje nie sa przesylane.
import { renderWyboruKosci, renderWyboruZPuli, renderOszukaj, renderPanelAkcji } from "./wspolne.js";
import { ustawMojaReke } from "./stol.js";

const otwarte = new Map(); // id zapytania -> otwarte okno

// Zbiera wartosci pol formularza w prosty obiekt (checkbox: true/false, radio: zaznaczona wartosc)
function zbierzPola(form) {
  const pola = {};
  if (!form) return pola;
  for (const el of Array.from(form.elements || [])) {
    if (!el.name || el.type === "button" || el.type === "submit") continue;
    if (el.type === "checkbox") pola[el.name] = Boolean(el.checked);
    else if (el.type === "radio") {
      if (el.checked) pola[el.name] = el.value;
    } else pola[el.name] = el.value;
  }
  return pola;
}

// Zamyka okno na prosbe MG (np. gdy MG pominal gracza, ktory nie reagowal)
export function zamknijOkno(id) {
  const dialog = otwarte.get(id);
  if (!dialog) return;
  try {
    dialog.close();
  } catch (err) {
    console.warn("Kościany Poker — nie udało się zamknąć okna", err);
  }
}

// Obsluga zapytania od MG: pokazuje okno i zwraca {status, akcja, pola}
export function obsluzOkno(dane) {
  if (!dane || typeof dane !== "object") return { status: "blad", komunikat: "pusta wiadomość" };
  if (dane.typ === "reka") {
    ustawMojaReke(dane.kosci);
    return { status: "ok" };
  }
  if (dane.typ === "powiadom") {
    ui.notifications.warn(String(dane.tekst || ""));
    return { status: "ok" };
  }
  return new Promise((resolve) => {
    const DialogV2 = foundry.applications.api.DialogV2;
    let akcjaPanelu = null;
    let zakonczone = false;
    const zakoncz = (wynik) => {
      if (zakonczone) return;
      zakonczone = true;
      otwarte.delete(dane.id);
      resolve(wynik);
    };
    const wynikPrzycisku = (akcja) => (event, button) => ({ status: "ok", akcja: akcja, pola: zbierzPola(button && button.form) });
    let przyciski;
    if (dane.typ === "confirm") {
      przyciski = [
        { action: "yes", label: (dane.tak && dane.tak.label) || "Tak", icon: dane.tak && dane.tak.icon, default: true, callback: wynikPrzycisku("yes") },
        { action: "no", label: (dane.nie && dane.nie.label) || "Nie", icon: dane.nie && dane.nie.icon, callback: wynikPrzycisku("no") }
      ];
    } else {
      przyciski = [
        { action: "ok", label: (dane.ok && dane.ok.label) || "OK", icon: dane.ok && dane.ok.icon, default: true, callback: wynikPrzycisku("ok") }
      ];
    }
    const render = (event, dialog) => {
      otwarte.set(dane.id, dialog);
      const p = dane.parametry || {};
      try {
        if (dane.tryb === "wymiana") renderWyboruKosci(event, dialog);
        else if (dane.tryb === "pula") renderWyboruZPuli(dialog, p);
        else if (dane.tryb === "oszukaj") renderOszukaj(dialog, p);
        else if (dane.tryb === "panel") renderPanelAkcji(dialog, (a) => { akcjaPanelu = a; });
      } catch (err) {
        console.error("Kościany Poker — błąd okna gracza", err);
      }
    };
    const konfiguracja = {
      id: "kp-zdalne-" + dane.id,
      window: { title: String(dane.tytul || "Kościany Poker") },
      content: String(dane.tresc || ""),
      buttons: przyciski,
      render: render,
      rejectClose: false
    };
    if (dane.szerokosc) konfiguracja.position = { width: Number(dane.szerokosc) };
    Promise.resolve(DialogV2.wait(konfiguracja))
      .then((wynik) => {
        if (akcjaPanelu) return zakoncz({ status: "ok", akcja: akcjaPanelu, pola: {} });
        if (wynik && typeof wynik === "object" && wynik.status === "ok") return zakoncz(wynik);
        return zakoncz({ status: "zamkniete" });
      })
      .catch((err) => zakoncz({ status: "blad", komunikat: String(err && err.message ? err.message : err) }));
  });
}
