export type ClientRateWorkEntry = {
  workerId: string;
  hours: number;
  tonnes: number;
};

export type ClientWorkerRateInput = {
  workerId: string;
  ratePerTonne: number;
};

export type ClientRateGroup = {
  ratePerTonne: number;
  workerCount: number;
  hours: number;
  tonnes: number;
  subtotal: number;
};

export function calculateClientRateGroups(
  entries: ClientRateWorkEntry[],
  workerRates: ClientWorkerRateInput[]
): ClientRateGroup[] {
  const rateByWorker = new Map(
    workerRates.map((rate) => [rate.workerId, Number(rate.ratePerTonne)])
  );
  const groups = new Map<number, ClientRateGroup & { workerIds: Set<string> }>();

  for (const entry of entries) {
    const ratePerTonne = rateByWorker.get(entry.workerId) ?? 0;
    if (entry.hours <= 0 || entry.tonnes <= 0 || ratePerTonne <= 0) continue;

    const current = groups.get(ratePerTonne) ?? {
      ratePerTonne,
      workerCount: 0,
      workerIds: new Set<string>(),
      hours: 0,
      tonnes: 0,
      subtotal: 0
    };
    current.workerIds.add(entry.workerId);
    current.workerCount = current.workerIds.size;
    current.hours += entry.hours;
    current.tonnes += entry.tonnes;
    current.subtotal += roundMoney(entry.tonnes * ratePerTonne);
    groups.set(ratePerTonne, current);
  }

  return [...groups.values()]
    .map((group) => ({
      ratePerTonne: group.ratePerTonne,
      workerCount: group.workerCount,
      hours: round(group.hours, 2),
      tonnes: round(group.tonnes, 3),
      subtotal: roundMoney(group.subtotal)
    }))
    .sort((left, right) => right.ratePerTonne - left.ratePerTonne);
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function roundMoney(value: number) {
  return round(value, 2);
}
