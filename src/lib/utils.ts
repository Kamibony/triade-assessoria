export function cn(...classes: (string | undefined | null | false | { [key: string]: boolean })[]) {
  return classes
    .map(c => {
      if (!c) return '';
      if (typeof c === 'string') return c;
      if (typeof c === 'object') {
        return Object.entries(c)
          .filter(([_, value]) => Boolean(value))
          .map(([key]) => key)
          .join(' ');
      }
      return '';
    })
    .join(' ')
    .trim();
}
