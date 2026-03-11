export const parseDateOnly = (value) => {
  if (!value) return null;

  const datePart = String(value).slice(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);

  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
};
