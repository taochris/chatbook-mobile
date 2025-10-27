/**
 * Gestion des contacts et mapping numéro -> nom
 * Évite les doublons de noms en utilisant une normalisation stricte
 */

import Contacts from 'react-native-contacts';
import { normalizePhoneE164 } from './phone';

/**
 * Construit un mapping numéro normalisé -> nom de contact
 * @param {string} defaultCountry - Code pays par défaut (ex: 'FR')
 * @returns {Promise<Map<string, string>>} Map avec numéro normalisé comme clé et nom comme valeur
 */
export async function buildNumberToNameMap(defaultCountry = 'FR') {
  const map = new Map();
  const rawToNormalized = new Map(); // Pour debug
  
  try {
    const all = await Contacts.getAll();
    console.log(`📱 Chargement de ${all.length} contacts...`);
    
    for (const contact of all) {
      // Récupérer le meilleur nom disponible
      const name = contact.displayName || 
                   [contact.givenName, contact.familyName].filter(Boolean).join(' ').trim() ||
                   'Contact sans nom';
      
      // Traiter tous les numéros du contact
      const phoneNumbers = contact.phoneNumbers || [];
      for (const phoneEntry of phoneNumbers) {
        const rawNumber = phoneEntry?.number;
        if (!rawNumber) continue;
        
        const normalized = normalizePhoneE164(rawNumber, defaultCountry);
        
        if (normalized) {
          const existingName = map.get(normalized);
          
          // Si le numéro existe déjà, garder le nom le plus complet
          if (!existingName || String(name).length > String(existingName).length) {
            map.set(normalized, name);
            rawToNormalized.set(rawNumber, normalized);
            
            // Log détaillé pour les 5 premiers contacts
            if (map.size <= 5) {
              console.log(`📞 Contact: ${name}`);
              console.log(`   Raw: ${rawNumber}`);
              console.log(`   Normalized: ${normalized}`);
            }
          }
        } else {
          console.warn(`⚠️ Impossible de normaliser: ${rawNumber} pour ${name}`);
        }
      }
    }
    
    console.log(`✅ Contacts chargés: ${map.size} numéros mappés depuis ${all.length} contacts`);
    console.log(`📋 Exemples de mapping:`);
    let count = 0;
    for (const [num, name] of map) {
      if (count++ < 3) {
        console.log(`   ${num} -> ${name}`);
      }
    }
  } catch (error) {
    console.error('❌ Erreur lors du chargement des contacts:', error);
  }
  
  return map;
}
