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
 */
const IN_ISRAEL = false;

export type DayNote = {
  /** YYYY-MM-DD in local terms. */
  date: string;
  /** Hebrew date in gematriya, e.g. "כ״ג אלול". */
  hebrew: string;
  /** Hebrew day of month alone, for tight cells: "כ״ג". */
  hebrewDay: string;
  /** Parsha read that Shabbos, only set on Saturdays. */
  parsha?: string;
  /** Yom tov or fast falling on this day, if any. */
  holiday?: string;
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

  const { HDate, getSedra, HebrewCalendar, flags } = hebcal;

  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const hd = new HDate(new Date(d));
    const gematriya = hd.renderGematriya(true);
    // renderGematriya gives "כ״ג אלול תשפ״ו"; the day alone is the first word.
    const [dayOnly] = gematriya.split(" ");

    const note: DayNote = {
      date: isoOf(d),
      hebrew: gematriya.split(" ").slice(0, 2).join(" "),
      hebrewDay: dayOnly,
    };

    if (d.getDay() === 6) {
      const result = getSedra(hd.getFullYear(), IN_ISRAEL).lookup(hd);
      // On a chag the reading is the holiday's, not a parsha; hebcal reports
      // the holiday name in `parsha` and flags it, so only keep real sedras.
      if (!result.chag) note.parsha = result.parsha.join("-");
    }

    notes.set(note.date, note);
  }

  // Holidays come from one call over the window rather than per day.
  const events = HebrewCalendar.calendar({
    start: new Date(from),
    end: new Date(to),
    il: IN_ISRAEL,
    noMinorFast: true,
    noSpecialShabbat: true,
    noModern: true,
  });

  const YOM_TOV = flags.CHAG | flags.MAJOR_FAST | flags.YOM_TOV_ENDS;

  for (const event of events) {
    const iso = isoOf(event.getDate().greg());
    const note = notes.get(iso);
    if (!note) continue;

    const name = event.render("en");
    // Keep the first, most significant label for a day rather than piling up.
    if (!note.holiday) note.holiday = name;
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
