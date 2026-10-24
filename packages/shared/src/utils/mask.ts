/**
 * Mask the local part of an email for display.
 *
 * The first characters stay readable so the person recognizes their own account: up to four when the
 * local part is long (`bett****@gmail.com`), and just the first one when it is short — `habi@lotly.lat`
 * used to render as `****@lotly.lat`, which fits every account on the domain and therefore identifies
 * none. A single character is masked entirely instead of revealed.
 */
export const maskEmail = (email: string) => {
  const [name = '', domain = ''] = email.split('@');
  const visibleChars = name.length > 4 ? 4 : name.length > 1 ? 1 : 0;
  return `${name.slice(0, visibleChars)}****@${domain}`;
};

export const maskPhone = (phone: string) => `****${phone.slice(-4)}`;

/**
 * Mask a username for display. The first and last characters stay readable so the person can
 * recognize their own account, matching how `maskEmail` keeps a hint of the local part. Values of
 * two characters or fewer are masked entirely, since keeping both ends would show the whole value.
 */
export const maskUsername = (username: string) =>
  username.length > 2
    ? `${username.slice(0, 1)}****${username.slice(-1)}`
    : '*'.repeat(username.length);

export default Object.freeze({ maskEmail, maskPhone, maskUsername });
