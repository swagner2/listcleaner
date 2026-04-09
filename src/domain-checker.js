// Comprehensive dictionary of misspelled email domains
// Maps typo → correct domain. null means "this is a real domain, don't flag"
const DOMAIN_CORRECTIONS = {
  // --- Gmail ---
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmil.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmali.com': 'gmail.com',
  'gmaik.com': 'gmail.com',
  'gmaio.com': 'gmail.com',
  'gmaul.com': 'gmail.com',
  'gmale.com': 'gmail.com',
  'gmeil.com': 'gmail.com',
  'gmill.com': 'gmail.com',
  'gmaiil.com': 'gmail.com',
  'gmaail.com': 'gmail.com',
  'gmsil.com': 'gmail.com',
  'gmqil.com': 'gmail.com',
  'gimail.com': 'gmail.com',
  'gemail.com': 'gmail.com',
  'gamail.com': 'gmail.com',
  'gmaol.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.om': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cmo': 'gmail.com',
  'gmail.vom': 'gmail.com',
  'gmail.cim': 'gmail.com',
  'gmail.comm': 'gmail.com',
  'gmail.coml': 'gmail.com',
  'gmail.net': 'gmail.com',
  'gmail.org': 'gmail.com',
  'gmail.ocm': 'gmail.com',
  'gmaik.con': 'gmail.com',

  // --- Yahoo ---
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yaoo.com': 'yahoo.com',
  'yahho.com': 'yahoo.com',
  'yhaoo.com': 'yahoo.com',
  'yhoo.com': 'yahoo.com',
  'yaboo.com': 'yahoo.com',
  'yanoo.com': 'yahoo.com',
  'yaahoo.com': 'yahoo.com',
  'yahop.com': 'yahoo.com',
  'yahoi.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yahoo.cm': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yahoo.om': 'yahoo.com',
  'yahoo.cmo': 'yahoo.com',
  'yahoo.ocm': 'yahoo.com',
  'yahoo.comm': 'yahoo.com',

  // --- Outlook ---
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'outllook.com': 'outlook.com',
  'outlool.com': 'outlook.com',
  'outook.com': 'outlook.com',
  'outlokk.com': 'outlook.com',
  'oultook.com': 'outlook.com',
  'outloock.com': 'outlook.com',
  'outlookk.com': 'outlook.com',
  'outlook.co': 'outlook.com',
  'outlook.cm': 'outlook.com',
  'outlook.con': 'outlook.com',
  'outlook.cmo': 'outlook.com',

  // --- Hotmail ---
  'hotmal.com': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmil.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmaill.com': 'hotmail.com',
  'hotmaul.com': 'hotmail.com',
  'hotamil.com': 'hotmail.com',
  'homail.com': 'hotmail.com',
  'hotmali.com': 'hotmail.com',
  'htmail.com': 'hotmail.com',
  'htomail.com': 'hotmail.com',
  'hotmall.com': 'hotmail.com',
  'hotmsil.com': 'hotmail.com',
  'hotmeil.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'hotmail.cm': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmail.cmo': 'hotmail.com',

  // --- AOL ---
  'ao.com': 'aol.com',
  'aool.com': 'aol.com',
  'aoll.com': 'aol.com',
  'aol.co': 'aol.com',
  'aol.cm': 'aol.com',
  'aol.con': 'aol.com',
  'aol.cmo': 'aol.com',

  // --- iCloud ---
  'iclod.com': 'icloud.com',
  'icoud.com': 'icloud.com',
  'iclould.com': 'icloud.com',
  'icloud.co': 'icloud.com',
  'icloud.con': 'icloud.com',
  'icloud.cm': 'icloud.com',

  // --- Comcast ---
  'comast.net': 'comcast.net',
  'comcas.net': 'comcast.net',
  'comcat.net': 'comcast.net',
  'comcast.con': 'comcast.net',
  'comcast.ner': 'comcast.net',

  // --- Live ---
  'live.co': 'live.com',
  'live.con': 'live.com',
  'live.cm': 'live.com',

  // --- Real providers that look like typos (do NOT flag) ---
  'gmx.com': null,
  'mail.com': null,
  'aim.com': null,
};

// Additional patterns: disposable/temporary email domains
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
  'dispostable.com', 'mailnesia.com', 'maildrop.cc', 'trashmail.com',
  'temp-mail.org', 'fakeinbox.com', 'getnada.com', 'tempail.com',
  'mohmal.com', 'burpcollaborator.net', '10minutemail.com',
  'minutemail.com', 'tempinbox.com', 'emailondeck.com',
]);

export function checkDomain(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, reason: 'malformed_email', detail: 'Empty or non-string email' };
  }

  const lower = email.toLowerCase().trim();
  const parts = lower.split('@');

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: 'malformed_email', detail: 'Missing @ or local part' };
  }

  const domain = parts[1];

  // Check disposable domains
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, reason: 'disposable_domain', detail: `Disposable email domain: ${domain}` };
  }

  // Check misspelled domains
  const correction = DOMAIN_CORRECTIONS[domain];
  if (correction !== undefined) {
    if (correction === null) {
      // Real provider, not a typo
      return { valid: true };
    }
    return {
      valid: false,
      reason: 'misspelled_domain',
      detail: `Likely typo: ${domain} → ${correction}`,
      typo: domain,
      suggestion: correction,
    };
  }

  // No issues found at domain level
  return { valid: true };
}
