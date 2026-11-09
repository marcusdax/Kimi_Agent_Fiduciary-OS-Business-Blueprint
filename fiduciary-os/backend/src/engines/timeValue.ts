/**
 * timeValue.ts - Excel-compatible time-value-of-money functions (roadmap section 2).
 *
 * Thin typed wrappers over formulajs (MIT) so an advisor can reconcile any figure here with
 * PMT/FV/PV/NPER/RATE in their own spreadsheet. formulajs reports errors by returning an Error
 * object instead of throwing; these wrappers turn that into a RangeError.
 */
import * as formulajs from '@formulajs/formulajs';

function checked(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${name} cannot be computed for these inputs`);
  }
  return value;
}

type Timing = 0 | 1;

/** Periodic payment (negative when it is an outflow, as in Excel). */
export const pmt = (rate: number, nper: number, pv: number, fv = 0, type: Timing = 0): number =>
  checked(formulajs.PMT(rate, nper, pv, fv, type), 'PMT');

export const fv = (rate: number, nper: number, payment: number, pv = 0, type: Timing = 0): number =>
  checked(formulajs.FV(rate, nper, payment, pv, type), 'FV');

export const pv = (rate: number, nper: number, payment: number, fv = 0, type: Timing = 0): number =>
  checked(formulajs.PV(rate, nper, payment, fv, type), 'PV');

export const nper = (rate: number, payment: number, pv: number, fv = 0, type: Timing = 0): number =>
  checked(formulajs.NPER(rate, payment, pv, fv, type), 'NPER');

export const rate = (nperValue: number, payment: number, pv: number, fv = 0, type: Timing = 0): number =>
  checked(formulajs.RATE(nperValue, payment, pv, fv, type), 'RATE');
