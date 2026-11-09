import { projectPlan, financialInputs } from '../../src/services/financial-plan';
import { planRows } from '../../src/services/planPdf';

describe('planRows', () => {
  const inputs = financialInputs.parse({ name: 'Plan', asOf: '2026-01-01', source: 'Client entered', balances: { cash: 1000000, bonds: 0, equities: 5000000, other: 0 }, monthlyIncomeCents: 800000, monthlySpendingCents: 500000, annualReturnBps: 500, annualFeeBps: 50, annualInflationBps: 250, years: 10 });
  const rows = Object.fromEntries(planRows(inputs, projectPlan(inputs)));
  it('formats dollars and percents for clients', () => {
    expect(rows['Cash']).toBe('$10,000');
    expect(rows['Total starting balance']).toBe('$60,000');
    expect(rows['Assumed annual return']).toBe('5.00%');
    expect(rows['Months until balance reaches zero']).toBe('Not within horizon');
  });
  it('real balance is below nominal when inflation is positive', () => {
    const n = Number(rows["Projected balance, year 10 (nominal)"].replace(/[$,]/g, ''));
    const r = Number(rows["Projected balance, year 10 (today's dollars)"].replace(/[$,]/g, ''));
    expect(r).toBeLessThan(n);
  });
});
