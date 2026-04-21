"use server";

import { getEnabledStates } from "./enabled-states";

export async function loadEnabledStates(): Promise<string[]> {
  const states = await getEnabledStates();
  return [...states].sort();
}
