/**
 * Normalisation des numéros de téléphone au format E.164
 * Évite les doublons de conversations causés par des formats différents
 */

export function normalizePhoneE164(raw, defaultCountry = 'FR') {
  if (!raw) return null;
  
  // Nettoyer le numéro : enlever espaces, tirets, parenthèses, points
  let s = String(raw).trim().replace(/[()\-.\s]/g, '');
  
  // Convertir 00 en +
  if (s.startsWith('00')) {
    s = '+' + s.slice(2);
  }
  
  // Si déjà au format international (+), retourner tel quel
  if (s.startsWith('+')) {
    return s;
  }
  
  // France : 0X XXXXXXXX -> +33X XXXXXXXX
  if (defaultCountry === 'FR' && /^0[1-9]\d{8}$/.test(s)) {
    return '+33' + s.slice(1);
  }
  
  // Dernier recours : si 9-12 chiffres, garder tel quel (évite troncature agressive)
  if (/^\d{9,12}$/.test(s)) {
    return s;
  }
  
  return null;
}

/**
 * Formatte un numéro E.164 pour l'affichage
 */
export function formatForDisplay(e164) {
  if (!e164) return '';
  
  // Si commence par +33, formater en français
  if (e164.startsWith('+33')) {
    const local = '0' + e164.slice(3);
    // Format : 0X XX XX XX XX
    return local.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5');
  }
  
  return e164;
}
