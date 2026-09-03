"use client";

import { createContext, useContext } from "react";

/** YYYY-MM-DD of a Saturday the yeshiva is off -> the label to show. */
export type OffShabbosim = Record<string, string>;

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
