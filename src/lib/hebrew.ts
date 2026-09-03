/**
 * Hebrew calendar annotations for the date picker.
 *
 * Everything here is pure and works in the browser. hebcal is loaded lazily by
 * `loadHebrewMonth` so a couple of hundred kilobytes of calendar tables stay
 * out of the initial page and only arrive when somebody opens the picker.
 *
 * Elkins Park is Diaspora, so the sedra and yom tov schedules use il = false.
 * That matters: Israel and the Diaspora diverge for part of the year whenever
 * the eighth day of Pesach or the second of Shavuos falls on Shabbos.
 *
 * Parshiyos and yom tov are named in Hebrew, without nikud -- this is a
 * yeshiva, and "נצבים־וילך" is what anyone here would call it. The English is
 * kept alongside for the tooltip and for anyone reading a screen reader.
 */
const IN_ISRAEL = false;

/** hebcal locale: Hebrew names without vowel points, which read better small. */
const HEBREW = "he-x-NoNikud";

export type DayNote = {
  /** YYYY-MM-DD in local terms. */
  date: string;
  /** Hebrew date in gematriya, e.g. "כ״ג אלול". */
  hebrew: string;
  /** Hebrew day of month alone, for tight cells: "כ״ג". */
  hebrewDay: string;
  /** Parsha read that Shabbos in Hebrew, e.g. "נצבים־וילך". Saturdays only. */
  parsha?: string;
  /** The same parsha transliterated, for tooltips: "Nitzavim-Vayeilech". */
  parshaEn?: string;
  /** Yom tov or fast falling on this day in Hebrew, if any. */
  holiday?: string;
  /** The same in English. */
  holidayEn?: string;
  /** A day on which the office would not expect anybody to be driving. */
  isYomTov?: boolean;
};

export type HebrewMonth = Map<string, DayNote>;

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Annotations for every day in a window, keyed by YYYY-MM-DD.
 *
 * `from` and `to` are local calendar dates; the picker asks for the whole
 * six-week grid it is about to draw, not just the month.
 */
export async function loadHebrewMonth(from: Date, to: Date): Promise<HebrewMonth> {
  const notes: HebrewMonth = new Map();

  let hebcal: typeof import("@hebcal/core");
  try {
    hebcal = await import("@hebcal/core");
  } catch {
    // A calendar without Hebrew dates is still a usable calendar.
    return notes;
  }

  const { HDate, HebrewCalendar, flags } = hebcal;

  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const hd = new HDate(new Date(d));
    const gematriya = hd.renderGematriya(true);
    // renderGematriya gives "כ״ג אלול תשפ״ו"; the day alone is the first word.
    const [dayOnly] = gematriya.split(" ");

    notes.set(isoOf(d), {
      date: isoOf(d),
      hebrew: gematriya.split(" ").slice(0, 2).join(" "),
      hebrewDay: dayOnly,
    });
  }

  // Parshiyos and holidays both come from one pass over the window rather than
  // a lookup per day. Asking for sedrot here rather than reading the sedra
  // directly also settles the chag case for us: on a Shabbos whose reading is
  // the yom tov's, hebcal simply emits no parsha event.
  const events = HebrewCalendar.calendar({
    start: new Date(from),
    end: new Date(to),
    il: IN_ISRAEL,
    sedrot: true,
    noMinorFast: true,
    noSpecialShabbat: true,
    noModern: true,
  });

  const YOM_TOV = flags.CHAG | flags.MAJOR_FAST | flags.YOM_TOV_ENDS;

  for (const event of events) {
    const note = notes.get(isoOf(event.getDate().greg()));
    if (!note) continue;

    if (event.getFlags() & flags.PARSHA_HASHAVUA) {
      // "פרשת נצבים־וילך" -> "נצבים־וילך"; the cells are too tight to repeat
      // the word on all fifty of them.
      note.parsha = event.render(HEBREW).replace(/^פרשת\s+/, "");
      note.parshaEn = event.render("en").replace(/^Parashat\s+/, "");
      continue;
    }

    // Keep the first, most significant label for a day rather than piling up.
    if (!note.holiday) {
      // hebcal tags Rosh Hashana with the year it starts ("ראש השנה 5787");
      // in a calendar that already shows the Hebrew date it is just noise.
      note.holiday = event.render(HEBREW).replace(/\s+\d{4}$/, "");
      note.holidayEn = event.render("en").replace(/\s+\d{4}$/, "");
    }
    if (event.getFlags() & YOM_TOV) note.isYomTov = true;
  }

  return notes;
}

/** The Saturday of the week containing `date`, as YYYY-MM-DD. */
export function shabbosOf(date: Date): string {
  const d = new Date(date);
  d.setDate(d.getDate() + (6 - d.getDay()));
  return isoOf(d);
}

/** Every Saturday from `from` for `count` weeks, as YYYY-MM-DD. */
export function upcomingShabbosim(from: Date, count: number): string[] {
  const first = new Date(from);
  first.setDate(first.getDate() + ((6 - first.getDay() + 7) % 7));

  return Array.from({ length: count }, (_, i) => {
    const d = new Date(first);
    d.setDate(d.getDate() + i * 7);
    return isoOf(d);
  });
}

export { isoOf };
