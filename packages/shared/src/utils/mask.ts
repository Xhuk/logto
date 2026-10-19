export const maskEmail = (email: string) => {
  const [name = '', domain = ''] = email.split('@');
  const preview = name.length > 4 ? `${name.slice(0, 4)}` : '';
  return `${preview}****@${domain}`;
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
