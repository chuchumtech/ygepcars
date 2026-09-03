"use client";

import { createContext, useContext } from "react";

/** One day covered by an off Shabbos. */
export type OffDay = {
  /** What kind of off Shabbos, e.g. "Bein hazmanim". */
  label: string;
  /** Which day of the off Shabbos this is. */
  part: "friday" | "shabbos" | "sunday";
  /** The Saturday it belongs to, so the three days read as one thing. */
  shabbos: string;
};

/** Every day an off Shabbos covers -> what it is. Keyed YYYY-MM-DD. */
export type OffShabbosim = Record<string, OffDay>;

const OffShabbosimContext = createContext<OffShabbosim>({});

/**
 * The off Shabbosim are the same for every picker on the page, so each layout
 * loads them once and hands them down instead of every screen threading a prop
 * through to whichever calendar happens to be open.
 */
export function OffShabbosimProvider({
  value,
  children,
}: {
  value: OffShabbosim;
  children: React.ReactNode;
}) {
  return (
    <OffShabbosimContext.Provider value={value}>{children}</OffShabbosimContext.Provider>
  );
}

export function useOffShabbosim(): OffShabbosim {
  return useContext(OffShabbosimContext);
}
