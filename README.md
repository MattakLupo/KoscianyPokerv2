# Kościany Poker (WFRP 4e) — moduł Foundry VTT v14

Karczemna minigra w kości dla Warhammer Fantasy Roleplay 4e (polskie wydanie): poker na 5k6 z wymianą kości,
podbijaniem stawki, oszustwami i pulami z all-in.

## Instalacja
1. Rozpakuj folder `kosciany-poker` do `Data/modules/` w katalogu danych Foundry.
2. Uruchom Foundry, w świecie włącz moduł „Kościany Poker (WFRP 4e)”. Gracze używają go bez dodatkowej konfiguracji,
   ale muszą mieć go włączonego (moduł jest w świecie, więc włącza się go raz dla wszystkich).
3. Zalecany moduł Dice So Nice! (animacje 3D). Bez niego gra działa, tylko bez kości 3D.

## Uruchomienie
Przy pierwszym wczytaniu świata moduł tworzy dwa makra (tylko dla MG): **Kościany Poker** oraz **Kościany Poker — przywróć sakiewki**.
Możesz je przeciągnąć na pasek makr. Makro startowe otwiera okno stołu: przeciągnij postacie z zakładki Actors, ustaw wpisowe,
format meczu i opcje.

## Jak się gra
- Pierwszy rzut 5k6 jest jawny, wymiana kości jest ukryta (widzi ją tylko gracz i MG).
- Po wymianie każdy gracz decyduje przy stole: podbicie (kwotę wpisuje ręcznie), pas, Czytaj z twarzy, Oszukaj, Obciążone kości, Szczęście.
- Gdy gracz jest online, jego okna otwierają się **na jego komputerze**. MG widzi panel „Czekam na gracza” z przyciskiem
  **Pomiń gracza** i decyduje, co zrobić, gdy ktoś zamknie okno.
- BN-i przy stole (bez gracza) grają automatycznie; można to wyłączyć w oknie startowym.
- Przed każdym meczem moduł zapisuje stan monet. Makro **przywróć sakiewki** cofa wpisowe i wygrane ostatniego meczu.
  Jeśli mecz nie został dokończony (np. zamknięta przeglądarka), moduł zapyta o to przy następnym starcie.

## Co moduł rozpoznaje na kartach (po nazwie)
- Umiejętności: Hazard, Intuicja, Percepcja, Opanowanie, Zwinne Palce (również nazwy angielskie).
- Talenty: Szuler Kościany (angielski Diceman), Szósty Zmysł (Sixth Sense), Szczęście (Luck) oraz Szybkie Ręce (Fast Hands, +1 PS za poziom przy udanym teście Zwinnych Palców). Szuler Karciany (Cardsharp) jest pomijany, bo dotyczy kart. Talent Zręczny (Nimble Fingered) to w WFRP 4e tylko +5 do Zręczności na starcie, więc nie daje premii w grze.
- Przedmioty (z ilością większą od zera): nazwa zawierająca „kości”/„dice” — obciążone, fałszywe lub znaczone kości to oszustwo, reszta to zestaw do gry.
- Monety: Złota Korona, Srebrny Szyling, Mosiężny/Miedziany Pens (1 ZK = 20 SS = 240 MP).
- Punkty Szczęścia: pole `system.status.fortune.value` na karcie postaci.

## Stół do gry (od wersji 1.1.0)
- Na starcie meczu otwiera się okno „Kościany Poker — stół” na ekranie MG i każdego gracza z włączonym modułem (pole w oknie startowym, domyślnie włączone). Pokazuje miejsca graczy, kto teraz gra, pulę, ostatnie zdarzenie i kości przy każdym miejscu.
- Pierwszy rzut jest jawny (kości widać przy miejscu). Po wymianie kości są odwrócone rewersem; właściciel widzi swoje kości przy własnym miejscu, a MG może je podejrzeć przyciskiem „Pokaż ręce graczy (MG)”. Przy rozstrzygnięciu rundy wszystkie ręce, które dotrwały do końca, zostają odkryte, a zwycięzca jest podświetlony.
- Ukryte kości nie są wysyłane do wszystkich. Każdy gracz dostaje tylko własną rękę osobnym zapytaniem.
- Okno stołu można zamknąć krzyżykiem (nie wróci w tym samym meczu). Otwarcie go ponownie: `game.modules.get('kosciany-poker').api.stol();`.
- Pole „Kości 3D (Dice So Nice)” w oknie startowym włącza trójwymiarowe kości obok animacji na stole. Przy włączonym stole nie ma już dużych banerów tury ani animacji kubka na ekranie.
- Gracz, który odświeży stronę w trakcie meczu, dostaje stół i swoją rękę z powrotem (MG musi mieć otwartą grę).

## Kości na stole (od wersji 1.2.0)
- Kości leżą na sukni na „tacy” przed każdym graczem, nie w ramce z jego imieniem. Wielkość kości zależy od liczby graczy (1–8).
- Rzut: kości wylatują z miejsca gracza, obracają się w locie, odbijają od sukna i układają na tacy. Jawne kości w locie zmieniają oczka i zatrzymują się na wyniku. Przy wymianie lecą tylko wymieniane kości.
- Pod tacą jest nazwa układu (np. „Ful (6 na 3)”). Ukryte kości to rewersy; własne kości gracz widzi przy swojej tacy.
- Przy rozstrzygnięciu wszystkie ręce są odkryte na tacach, a taca zwycięzcy jest podświetlona na złoto. Spasowani i wyrzuceni nie mają tacy.

## Tokeny przy stole (od wersji 1.3.0)
- Przy każdym miejscu jest okrągły obraz tokena postaci (z karty: token prototypowy), a obok niego imię i status. Obramowanie tokena ma kolor statusu (tura, pas, zwycięzca).
- Gdy token jest filmem (webm/mp4) albo go brak, używany jest portret z karty. Dla BN bez karty i graczy bez postaci jest sylwetka zastępcza.
- Adres obrazu jest sprawdzany po stronie odbiorcy: tylko zwykłe pliki graficzne (png, jpg, webp, svg, gif, avif, bmp), bez cudzysłowów, „..” i adresów typu javascript:/data:. Błędny adres lub brak pliku daje sylwetkę zastępczą.

## Podbicie stawki: zgoda graczy i decyzje BN (od wersji 1.4.0)
- Każdy gracz, który zostaje w rundzie, musi się zgodzić na podbicie (dopłacić tyle samo albo wejść all-in za to, co ma) albo spasować. Decyduje sam, w oknie na własnym komputerze. W oknie widzi swoją rękę, pulę po podbiciu i koszt dopłaty. Gdy gra lokalnie, najpierw pojawia się ekran osłonowy.
- Zamknięcie okna zgody nie jest ani zgodą, ani pasem. Mistrz Gry wybiera: wróć do okna, pomiń gracza (pas) albo przerwij mecz (wszystkie wpłaty wracają).
- Weto MG na podbicie gracza działa jak dotąd (zatwierdź, zablokuj, wymuś pas). Podbicie obowiązuje dopiero po rozstrzygnięciu zgód wszystkich.
- BN grający automatycznie oceniają własne kości. Dopłacają, gdy szansa wygranej razy pula po dopłacie pokrywa koszt z 25% zapasem. Zakładają, że podbijający ma najczęściej mocną rękę (dwie pary lub lepiej), a pozostali rywale grają losowo. Bez monet pasują, a bez fula lub lepszego nie ryzykują ponad połowy sakiewki. Drobne podbicie przy dużej puli dopłacają nawet ze słabą ręką.
- BN podbijają od trójki. Wysokość podbicia to stawka wpisowa (12 MP, gdy jej nie ma), podwójna z fulem lub lepszym, ale nie więcej niż pół sakiewki. Każda decyzja BN jest widoczna dla MG w szepcie „[BN — automat]”.

## Wkłady i ALL-IN na stole (od wersji 1.5.0)
- Pod statusem gracza jest „wkład: …” (ile wpłacił do puli w tej rundzie). Gracz, który wszedł all-in za resztę sakiewki, ma czerwony znacznik ALL-IN na tokenie do końca rundy.
- Podbicie jest też komunikatem na stole („X podbija stawkę o …”), a wkłady odświeżają się od razu po dopłatach.

## Sprawdzenie kart przed grą (od wersji 1.5.0)
- Makro „Kościany Poker — sprawdź karty” (albo `game.modules.get('kosciany-poker').api.diagnostyka();`) pokazuje, co moduł odczyta z kart. Sprawdzane są zaznaczone tokeny, a gdy nic nie zaznaczono — postacie przypisane graczom.
- Dla każdej postaci raport zawiera: sakiewkę (monety i nominały), umiejętności (Hazard, Intuicja, Percepcja, Opanowanie, Zwinne Palce), talenty (Szuler Kościany, Szybkie Ręce, Szósty Zmysł, Szczęście), Punkty Szczęścia, zestaw i obciążone kości. Każdy wiersz ma status: OK (rozpoznano), UWAGA (zadziała inaczej, niż myślisz) albo BRAK (gra użyje wartości zastępczej).
- Makro tworzy się samo przy pierwszym uruchomieniu świata po aktualizacji (jeśli je usuniesz, nie wróci).

## Przebieg gry i dokładna wymiana (od wersji 1.6.0)
- W lewym dolnym rogu stołu jest panel „PRZEBIEG GRY” z ostatnimi 5 zdarzeniami (rzuty, wymiany, podbicia, dopłaty, pasy). Najnowszy wpis jest wyraźny, starsze przygaszone. Są tam tylko publiczne komunikaty (te same, co pod pulą), więc nie ujawnia ukrytych kości. Historia zaczyna się od nowa w każdym meczu.
- Przy wymianie i przerzutach (Szczęście, Przewaga Hazardu) lecą na stół dokładnie te kości, które zostały wymienione, a nie ostatnie w ręce.

## Dźwięki, ustawienia i zasady dodatkowe (od wersji 1.7.0)
- **Dźwięki** (własne pliki modułu w folderze `sounds/`): rzut kości (przy każdej animacji rzutu lub wymiany), żetony (przy podbiciu i dopłacie), gong (przy rozstrzygnięciu rundy). Każdy odtwarza je tylko na swoim komputerze. Po odświeżeniu strony nic nie gra „z przeszłości”.
- **Ustawienia klienta** (Konfiguracja ustawień → Moduły, osobno dla każdego gracza i MG): tempo animacji kości (szybko / normalnie / wolno), panel przebiegu gry (włącz/wyłącz), dźwięki (włącz/wyłącz) i głośność.
- **Żeton podbicia:** złoty żeton „+” na tacy gracza, który w tej rundzie podbił stawkę. Znika w nowej rundzie.
- **Szósty Zmysł:** w oknie startowym wybierasz zasadę dla Czytaj z twarzy: „+10 do testu za poziom” (domyślnie) albo „+1 PS za poziom przy udanym teście” (wg ogólnej zasady talentów; przy oblanym teście premia nie działa).
- **Szybkie Ręce a obserwatorzy:** talent zdejmuje obserwatorom bierny test Percepcji. W grze oznacza to, że każdy obserwator rzuca z karą −10 do testu za poziom talentu (maks. −30), a oszust nadal dostaje +1 PS za poziom przy udanym teście. Kara jest widoczna w raporcie dla MG. To mój wybór wykonawczy, bo zasady nie podają liczby.
- **Pechowy rzut oszusta (96–00):** pięć opisów zależnych od rzutu (96, 97, 98, 99, 00). To tylko opis fabularny, mechanika przyłapania się nie zmienia.

## Ograniczenia
- Moduł był testowany tylko na atrapach API Foundry. Przed grą zrób krótką próbną partię (tryb „Szybka partia”).
- W manifeście nie ma adresów `manifest` i `download`, więc aktualizacja z poziomu Foundry nie działa — instalacja ręczna.
- Gracz bez włączonego modułu albo offline gra na ekranie MG (okno jest wtedy pytaniem do MG).
