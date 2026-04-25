function parseDate(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return Number.isNaN(dateInput.getTime()) ? null : dateInput;

  const raw = String(dateInput).trim();
  if (!raw) return null;

  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // dd/mm/yyyy or dd-mm-yyyy
  const br = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (br) {
    const d = Number(br[1]);
    const m = Number(br[2]);
    const y = Number(br[3]);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d) return date;
    return null;
  }

  const native = new Date(raw);
  return Number.isNaN(native.getTime()) ? null : native;
}

function diffYears(start, end) {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e || e < s) return 0;

  let years = e.getFullYear() - s.getFullYear();
  const monthDiff = e.getMonth() - s.getMonth();
  const dayDiff = e.getDate() - s.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) years -= 1;
  return Math.max(0, years);
}

function monthsWorkedForProportion(start, end) {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e || e < s) return 0;

  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  if (e.getDate() >= 15) months += 1;
  return Math.min(12, Math.max(0, months));
}

function normalizeDateString(dateInput) {
  const date = parseDate(dateInput);
  if (!date) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

module.exports = {
  parseDate,
  diffYears,
  monthsWorkedForProportion,
  normalizeDateString
};
