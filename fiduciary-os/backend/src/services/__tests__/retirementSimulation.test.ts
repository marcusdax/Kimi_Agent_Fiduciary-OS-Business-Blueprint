import { runRetirementSimulation } from '../retirementSimulation';

describe('retirementSimulation engine', () => {
  it('produces reproducible P10 <= P25 <= Median <= P75 <= P90 bands', () => {
    const baseInput = {
      currentAge: 55,
      retirementAge: 65,
      endAge: 92,
      currentPortfolio: 1450000,
      annualContribution: 35000,
      monthlyRetirementSpend: 8500,
      equityWeight: 65,
      paths: 400,
      seed: 42,
    };
    const r1 = runRetirementSimulation(baseInput);
    const r2 = runRetirementSimulation(baseInput);

    expect(r1.successRate).toBe(r2.successRate);
    expect(r1.medianTerminalWealth).toBe(r2.medianTerminalWealth);
    expect(r1.pathsSimulated).toBe(400);
    for (const row of r1.rows) {
      expect(row.p10).toBeLessThanOrEqual(row.p25);
      expect(row.p25).toBeLessThanOrEqual(row.median);
      expect(row.median).toBeLessThanOrEqual(row.p75);
      expect(row.p75).toBeLessThanOrEqual(row.p90);
    }
  });

  it('reduces success rate under higher spending and Year-1 market stress', () => {
    const calm = runRetirementSimulation({
      currentAge: 60,
      retirementAge: 65,
      currentPortfolio: 1200000,
      annualContribution: 25000,
      monthlyRetirementSpend: 7000,
      equityWeight: 60,
      yearOneShockPct: 0,
      paths: 400,
      seed: 99,
    });
    const stressed = runRetirementSimulation({
      currentAge: 60,
      retirementAge: 65,
      currentPortfolio: 1200000,
      annualContribution: 25000,
      monthlyRetirementSpend: 13000,
      equityWeight: 60,
      yearOneShockPct: 25,
      paths: 400,
      seed: 99,
    });

    expect(stressed.successRate).toBeLessThan(calm.successRate);
    expect(stressed.p10TerminalWealth).toBeLessThanOrEqual(calm.p10TerminalWealth);
  });
});
